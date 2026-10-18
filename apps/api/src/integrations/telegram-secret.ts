import { createHash, timingSafeEqual } from 'node:crypto';

/** Telegram secret_token allows only A-Z, a-z, 0-9, _ and -. A bot token does not. */
export function telegramWebhookSecret(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function telegramSecretMatches(header: string | undefined, token: string): boolean {
  const given = Buffer.from(header ?? '');
  const expected = Buffer.from(telegramWebhookSecret(token));
  if (given.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(given, expected);
}
