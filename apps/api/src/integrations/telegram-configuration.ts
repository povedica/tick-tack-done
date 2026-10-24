import type { PrismaService } from '../prisma/prisma.service.js';
import { openField } from '../security/field-cipher.js';

/** Private compare-and-set identity. The token here is stored ciphertext, never an API field. */
export interface TelegramConfigurationRevision {
  readonly token: string;
  readonly updatedAt: Date;
  readonly webhookUrl: string | null;
}

/** Only credentials saved for this owner can activate Telegram. */
export async function telegramConfiguration(
  prisma: PrismaService,
  ownerId?: string,
): Promise<{
  token: string;
  secret: string;
  botId: string;
  username: string | null;
  revision?: TelegramConfigurationRevision;
}> {
  const row =
    ownerId === undefined
      ? null
      : await prisma.telegramBotConfiguration.findUnique({ where: { ownerId } });
  return row === null
    ? { token: '', secret: '', botId: '', username: null }
    : {
        token: openField(row.token),
        secret: openField(row.webhookSecret),
        botId: row.botId,
        username: row.username,
        revision: { token: row.token, updatedAt: row.updatedAt, webhookUrl: row.webhookUrl },
      };
}

/** Prevent using credentials from a different reservation than the validated link snapshot. */
export function telegramRevisionMatches(
  state: { botId: string; updatedAt: Date; webhookUrl: string | null } | null,
  configuration: { botId: string; revision?: TelegramConfigurationRevision },
): boolean {
  const revision = configuration.revision;
  return (
    state !== null &&
    revision !== undefined &&
    configuration.botId === state.botId &&
    revision.webhookUrl === state.webhookUrl &&
    revision.updatedAt.getTime() === state.updatedAt.getTime()
  );
}
