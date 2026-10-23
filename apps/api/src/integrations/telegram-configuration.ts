import type { PrismaService } from '../prisma/prisma.service.js';
import { openField } from '../security/field-cipher.js';

/** Only credentials saved for this owner can activate Telegram. */
export async function telegramConfiguration(
  prisma: PrismaService,
  ownerId?: string,
): Promise<{
  token: string;
  secret: string;
  botId: string;
  username: string | null;
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
      };
}
