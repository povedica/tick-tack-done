import { randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { DomainException } from '../../http/domain.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { openField, sealField } from '../../security/field-cipher.js';
import {
  telegramState,
  telegramWebhookUrl,
  TELEGRAM_WEBHOOK_ERROR,
  markTelegramError,
} from '../../integrations/telegram-state.js';

export { telegramWebhookUrl as webhookUrl } from '../../integrations/telegram-state.js';

@Injectable()
export class TelegramSettingsService {
  private readonly logger = new Logger(TelegramSettingsService.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  async status(user: AuthUser, snapshot?: Awaited<ReturnType<typeof telegramState>>) {
    const current = snapshot ?? (await telegramState(this.prisma, user.id));
    const row = current.configuration;
    return {
      state: current.state,
      can_manage: true,
      configured: current.configured,
      source: row === null ? 'none' : 'settings',
      username: row?.username ?? null,
      webhook_registered: ['webhook_ok', 'linked', 'blocked'].includes(current.state),
      webhook_url: row?.webhookUrl === TELEGRAM_WEBHOOK_ERROR ? null : (row?.webhookUrl ?? null),
      webhook_state:
        current.state === 'none'
          ? 'unconfigured'
          : current.state === 'token_saved'
            ? 'local_only'
            : current.state === 'error'
              ? 'error'
              : 'registered',
      updated_at: row?.updatedAt.toISOString() ?? null,
    };
  }

  async save(user: AuthUser, suppliedToken: string, force = false) {
    const token = suppliedToken.trim();
    if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) throw invalidToken();
    let identity: Record<string, unknown>;
    try {
      identity = await telegramRequest(token, 'getMe', {});
    } catch {
      throw invalidToken();
    }
    if (
      identity.is_bot !== true ||
      typeof identity.id !== 'number' ||
      !Number.isSafeInteger(identity.id) ||
      identity.id <= 0 ||
      typeof identity.username !== 'string' ||
      !/^[A-Za-z0-9_]+$/.test(identity.username)
    )
      throw invalidToken();
    const botId = String(identity.id);
    const username = identity.username;
    const previous = await this.prisma.telegramBotConfiguration.findUnique({
      where: { ownerId: user.id },
    });
    const assigned = await this.prisma.telegramBotConfiguration.findUnique({ where: { botId } });
    if (assigned !== null && assigned.ownerId !== user.id) throw botInUse();
    const secret =
      previous?.botId === botId
        ? openField(previous.webhookSecret)
        : randomBytes(32).toString('hex');
    const url = telegramWebhookUrl(user.id);
    const webhook = await telegramRequest(token, 'getWebhookInfo', {});
    if (typeof webhook.url !== 'string') throw configurationFailed();
    const legacyUrl =
      url === null ? null : `${new URL(url).origin}/api/v1/integrations/telegram/webhook`;
    const foreign =
      webhook.url.length > 0 &&
      webhook.url !== legacyUrl &&
      !(webhook.url === url && previous?.botId === botId);
    if (foreign && !force)
      throw new DomainException(
        HttpStatus.CONFLICT,
        'telegram_webhook_in_use',
        'Este bot tiene un webhook en otra URL. Puedes tomar el control si no se usa en otro entorno.',
      );
    // Reserve the unique bot BEFORE changing its remote webhook. Network never holds a DB transaction.
    try {
      const reservation = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`telegram-owner:${user.id}`}, 0))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`telegram-bot:${botId}`}, 0))`;
        const reserved = await tx.telegramBotConfiguration.findUnique({ where: { botId } });
        if (reserved !== null && reserved.ownerId !== user.id) throw botInUse();
        const latest = await tx.telegramBotConfiguration.findUnique({
          where: { ownerId: user.id },
        });
        if (
          latest?.token !== previous?.token ||
          latest?.webhookSecret !== previous?.webhookSecret ||
          (latest?.updatedAt.getTime() ?? null) !== (previous?.updatedAt.getTime() ?? null)
        )
          throw configurationFailed();
        if (previous?.botId !== botId) {
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
        const data = {
          token: sealField(token),
          webhookSecret: sealField(secret),
          botId,
          username,
          webhookUrl: url === null ? null : TELEGRAM_WEBHOOK_ERROR,
        };
        const reservationRow = await tx.telegramBotConfiguration.upsert({
          where: { ownerId: user.id },
          create: { ownerId: user.id, ...data },
          update: data,
        });
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.telegramBotConfigured,
          entityType: 'telegram_bot',
          entityId: user.id,
          action: 'updated',
          data: { username, webhook_registered: false },
          previous: null,
        });
        return reservationRow;
      });
      if (foreign && force)
        await telegramRequest(token, 'deleteWebhook', { drop_pending_updates: true });
      if (url !== null) {
        await telegramRequest(token, 'setWebhook', {
          url,
          secret_token: secret,
          allowed_updates: ['message', 'callback_query'],
          drop_pending_updates: true,
        });
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`telegram-owner:${user.id}`}, 0))`;
          const registered = await tx.telegramBotConfiguration.updateMany({
            where: {
              ownerId: user.id,
              botId,
              token: reservation.token,
              webhookSecret: reservation.webhookSecret,
              updatedAt: reservation.updatedAt,
              webhookUrl: reservation.webhookUrl,
            },
            data: { webhookUrl: url },
          });
          if (registered.count !== 1) throw configurationFailed();
          await this.events.record(tx, actorOf(user), {
            type: DomainEvent.telegramBotConfigured,
            entityType: 'telegram_bot',
            entityId: user.id,
            action: 'updated',
            data: { username, webhook_registered: true },
            previous: null,
          });
        });
      }
    } catch (error) {
      if (error instanceof DomainException) throw error;
      throw configurationFailed();
    }
    return this.status(user);
  }

  async retry(user: AuthUser) {
    const row = await this.prisma.telegramBotConfiguration.findUnique({
      where: { ownerId: user.id },
    });
    if (row === null)
      throw new DomainException(409, 'telegram_not_configured', 'Configura primero tu bot.');
    try {
      return await this.save(user, openField(row.token));
    } catch (error) {
      if (
        error instanceof DomainException &&
        (error.getResponse() as { code?: string }).code === 'telegram_token_invalid'
      )
        await markTelegramError(this.prisma, user.id, row.botId, row);
      throw error;
    }
  }

  async remove(user: AuthUser) {
    const row = await this.prisma.telegramBotConfiguration.findUnique({
      where: { ownerId: user.id },
    });
    if (row !== null) {
      try {
        await telegramRequest(openField(row.token), 'deleteWebhook', {
          drop_pending_updates: true,
        });
      } catch {
        this.logger.warn(
          'No se pudo retirar el webhook de Telegram; se eliminará la configuración local.',
        );
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`telegram-owner:${user.id}`}, 0))`;
      const current = await tx.telegramBotConfiguration.findUnique({ where: { ownerId: user.id } });
      // Remote deletion targeted the snapshot above; never delete a newer bot saved while it waited.
      if (
        current?.botId !== row?.botId ||
        current?.token !== row?.token ||
        current?.webhookSecret !== row?.webhookSecret ||
        current?.updatedAt.getTime() !== row?.updatedAt.getTime()
      ) {
        this.logger.warn('Se conserva el bot reemplazado durante la retirada del anterior.');
        return;
      }
      await tx.telegramLink.updateMany({
        where: { ownerId: user.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      await tx.telegramPairing.updateMany({
        where: { ownerId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.telegramCallback.updateMany({
        where: { ownerId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.telegramBotConfiguration.deleteMany({ where: { ownerId: user.id } });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.telegramUnlinked,
        entityType: 'telegram_bot',
        entityId: user.id,
        action: 'deleted',
        data: { bot_removed: true },
        previous: null,
      });
    });
  }
}
function invalidToken() {
  return new DomainException(
    400,
    'telegram_token_invalid',
    'Introduce un token válido de BotFather.',
  );
}
function botInUse() {
  return new DomainException(
    409,
    'telegram_bot_in_use',
    'Este bot ya pertenece a otra cuenta. Usa un bot exclusivo.',
  );
}
function configurationFailed() {
  return new DomainException(
    502,
    'telegram_configuration_failed',
    'No se pudo configurar el bot en Telegram. Reintenta el webhook.',
  );
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
    if (!response.ok || payload.ok !== true) throw configurationFailed();
    return typeof payload.result === 'object' && payload.result !== null
      ? (payload.result as Record<string, unknown>)
      : {};
  } catch {
    throw configurationFailed();
  }
}
