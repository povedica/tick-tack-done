import { EventRecorder } from '../events/event-recorder.js';
import { DomainEvent } from '../events/domain-events.js';
import type { TelegramConfigurationRevision } from './telegram-configuration.js';
import type { PrismaService } from '../prisma/prisma.service.js';

export type TelegramState = 'none' | 'token_saved' | 'webhook_ok' | 'linked' | 'blocked' | 'error';
/** Empty is a failed registration, null is a token saved for local use. Never expose this marker. */
export const TELEGRAM_WEBHOOK_ERROR = '';
export interface TelegramStateConfiguration {
  botId: string;
  username: string;
  webhookUrl: string | null;
  updatedAt: Date;
}
export interface TelegramStateLink {
  botId: string | null;
  chatId: string;
  status: string;
  username: string | null;
  displayName: string | null;
  createdAt: Date;
}
export function classifyTelegramState(
  configuration: TelegramStateConfiguration | null,
  link: TelegramStateLink | null,
  expectedWebhook: string | null,
): TelegramState {
  if (configuration === null) return 'none';
  if (configuration.webhookUrl === TELEGRAM_WEBHOOK_ERROR) return 'error';
  if (configuration.webhookUrl === null) return 'token_saved';
  if (expectedWebhook === null || configuration.webhookUrl !== expectedWebhook) return 'error';
  if (link?.botId !== configuration.botId) return 'webhook_ok';
  return link.status === 'blocked' ? 'blocked' : link.status === 'connected' ? 'linked' : 'error';
}
/** Owner-scoped, persisted state shared by the integration, preferences and deliveries. No network. */
export async function telegramState(prisma: PrismaService, ownerId: string) {
  const configuration = await prisma.telegramBotConfiguration.findUnique({
    where: { ownerId },
    select: { botId: true, username: true, webhookUrl: true, updatedAt: true },
  });
  const link =
    configuration === null
      ? null
      : await prisma.telegramLink.findFirst({
          where: { ownerId, botId: configuration.botId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        });
  const state = classifyTelegramState(configuration, link, telegramWebhookUrl(ownerId));
  return {
    state,
    configured: configuration !== null,
    linked: state === 'linked',
    status:
      state === 'none'
        ? 'not_configured'
        : state === 'linked'
          ? 'connected'
          : state === 'blocked'
            ? 'blocked'
            : state === 'error'
              ? 'error'
              : 'not_linked',
    reason:
      state === 'none'
        ? 'not_configured'
        : state === 'blocked'
          ? 'blocked'
          : state === 'linked'
            ? null
            : 'not_linked',
    configuration,
    link,
  } as const;
}
/** Public HTTPS origins supported by Telegram, never localhost or a private host. */
export function telegramWebhookUrl(ownerId: string): string | null {
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
    )
      return null;
    return `${url.origin}/api/v1/integrations/telegram/webhook/${ownerId}`;
  } catch {
    return null;
  }
}

/** A revoked credential observed during delivery/retry becomes a visible recoverable error. */
export async function markTelegramError(
  prisma: PrismaService,
  ownerId: string,
  botId: string,
  revision: Pick<TelegramConfigurationRevision, 'token' | 'updatedAt'>,
) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`telegram-owner:${ownerId}`}, 0))`;
    const changed = await tx.telegramBotConfiguration.updateMany({
      where: {
        ownerId,
        botId,
        token: revision.token,
        updatedAt: revision.updatedAt,
        OR: [{ webhookUrl: null }, { webhookUrl: { not: TELEGRAM_WEBHOOK_ERROR } }],
      },
      data: { webhookUrl: TELEGRAM_WEBHOOK_ERROR },
    });
    if (changed.count === 0) return;
    await new EventRecorder().record(
      tx,
      { ownerId, actorId: ownerId, actorKind: 'user', tokenId: null },
      {
        type: DomainEvent.telegramBotConfigured,
        entityType: 'telegram_bot',
        entityId: ownerId,
        action: 'updated',
        data: { webhook_registered: false, error: 'telegram_token_invalid' },
        previous: null,
      },
    );
  });
}
