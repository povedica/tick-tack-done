import { randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { DomainException } from '../../http/domain.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { openField, sealField } from '../../security/field-cipher.js';

@Injectable()
export class TelegramSettingsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  async status(user: AuthUser) {
    const row = await this.prisma.telegramBotConfiguration.findUnique({
      where: { ownerId: user.id },
      select: { username: true, webhookUrl: true, updatedAt: true },
    });
    return {
      can_manage: true,
      configured: row !== null,
      source: row === null ? 'none' : 'settings',
      username: row?.username ?? null,
      webhook_registered: row?.webhookUrl !== null && row?.webhookUrl !== undefined,
      webhook_url: row?.webhookUrl ?? null,
      webhook_state:
        row === null ? 'unconfigured' : row.webhookUrl === null ? 'local_only' : 'registered',
      updated_at: row?.updatedAt.toISOString() ?? null,
    };
  }

  async save(user: AuthUser, suppliedToken: string) {
    // Serialize configuration changes across API replicas. Keep secrets out of events and responses.
    try {
      await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`telegram-owner:${user.id}`}, 0))`;
          const previous = await tx.telegramBotConfiguration.findUnique({
            where: { ownerId: user.id },
          });
          const token = suppliedToken.trim();
          if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
            throw new DomainException(
              HttpStatus.BAD_REQUEST,
              'telegram_token_invalid',
              'Introduce un token válido de BotFather.',
            );
          }
          const identity = await telegramRequest(token, 'getMe', {});
          if (
            identity.is_bot !== true ||
            typeof identity.id !== 'number' ||
            !Number.isSafeInteger(identity.id) ||
            identity.id <= 0 ||
            typeof identity.username !== 'string' ||
            !/^[A-Za-z0-9_]+$/.test(identity.username)
          ) {
            throw new DomainException(
              HttpStatus.BAD_REQUEST,
              'telegram_token_invalid',
              'El token no identifica un bot.',
            );
          }
          const botId = String(identity.id);
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`telegram-bot:${botId}`}, 0))`;
          const assigned = await tx.telegramBotConfiguration.findUnique({ where: { botId } });
          if (assigned !== null && assigned.ownerId !== user.id) {
            throw new DomainException(
              HttpStatus.CONFLICT,
              'telegram_bot_in_use',
              'Este bot ya está reservado. Usa un bot exclusivo para tu cuenta.',
            );
          }
          const secret =
            previous?.botId === botId
              ? openField(previous.webhookSecret)
              : randomBytes(32).toString('hex');
          const url = webhookUrl(user.id);
          {
            const webhook = await telegramRequest(token, 'getWebhookInfo', {});
            if (typeof webhook.url !== 'string') {
              throw new DomainException(
                HttpStatus.BAD_GATEWAY,
                'telegram_configuration_failed',
                'Telegram no devolvió un estado de webhook válido.',
              );
            }
            if (
              webhook.url.length > 0 &&
              (webhook.url !== url || previous?.botId !== botId || previous.webhookUrl !== url)
            ) {
              throw new DomainException(
                HttpStatus.CONFLICT,
                'telegram_webhook_in_use',
                'Este bot ya tiene un webhook en otra URL. Usa un bot exclusivo para este entorno.',
              );
            }
          }
          // A different bot must not inherit chats or pairing codes from the previous bot.
          const previousBotId = previous?.botId;
          if (previousBotId !== botId) {
            await tx.telegramLink.updateMany({
              where: { ownerId: user.id, deletedAt: null },
              data: { deletedAt: new Date() },
            });
            await tx.telegramCallback.updateMany({
              where: { ownerId: user.id, usedAt: null },
              data: { usedAt: new Date() },
            });
            await tx.telegramPairing.updateMany({
              where: { ownerId: user.id, usedAt: null },
              data: { usedAt: new Date() },
            });
          }
          await tx.telegramBotConfiguration.upsert({
            where: { ownerId: user.id },
            create: {
              ownerId: user.id,
              token: sealField(token),
              webhookSecret: sealField(secret),
              botId,
              username: identity.username,
              webhookUrl: url,
            },
            update: {
              token: sealField(token),
              webhookSecret: sealField(secret),
              botId,
              username: identity.username,
              webhookUrl: url,
            },
          });
          await this.events.record(tx, actorOf(user), {
            type: DomainEvent.telegramBotConfigured,
            entityType: 'telegram_bot',
            entityId: user.id,
            action: 'updated',
            data: { username: identity.username, webhook_registered: url !== null },
            previous: null,
          });
          if (url !== null) {
            await telegramRequest(token, 'setWebhook', {
              url,
              secret_token: secret,
              allowed_updates: ['message', 'callback_query'],
            });
          }
        },
        { timeout: 40_000 },
      );
    } catch (error) {
      if (error instanceof DomainException) throw error;
      throw new DomainException(
        HttpStatus.BAD_GATEWAY,
        'telegram_configuration_failed',
        'No se pudo guardar la configuración del bot. Vuelve a intentarlo.',
      );
    }
    return this.status(user);
  }
}

/** Local configuration can be saved without exposing localhost as a Telegram webhook. */
export function webhookUrl(ownerId: string): string | null {
  try {
    const url = new URL(process.env.PUBLIC_URL ?? '');
    const hostname = url.hostname.replace(/\.$/, '');
    if (
      url.protocol !== 'https:' ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      ['localhost', '[::1]'].includes(hostname) ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      /^\d+\.\d+\.\d+\.\d+$/.test(hostname) ||
      hostname.includes(':') ||
      !hostname.includes('.') ||
      !['', '443', '80', '88', '8443'].includes(url.port)
    ) {
      return null;
    }
    return `${url.origin}/api/v1/integrations/telegram/webhook/${ownerId}`;
  } catch {
    return null;
  }
}

async function telegramRequest(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    const payload = (await response.json()) as { ok?: boolean; result?: unknown };
    if (!response.ok || payload.ok !== true) {
      throw new Error('rejected');
    }
    return typeof payload.result === 'object' && payload.result !== null
      ? (payload.result as Record<string, unknown>)
      : {};
  } catch {
    throw new DomainException(
      HttpStatus.BAD_GATEWAY,
      'telegram_configuration_failed',
      'No se pudo verificar o configurar el bot en Telegram. Revisa el token y vuelve a intentarlo.',
    );
  }
}
