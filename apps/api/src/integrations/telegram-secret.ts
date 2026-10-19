import { timingSafeEqual } from 'node:crypto';

const SECRET = /^[A-Za-z0-9_-]{16,256}$/;

/** Independent of the bot token. Set TELEGRAM_WEBHOOK_SECRET and the same value in setWebhook (S-08). */
export function telegramWebhookSecret(): string {
  const value = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  return SECRET.test(value) ? value : '';
}

export function telegramSecretMatches(header: string | undefined): boolean {
  const expected = telegramWebhookSecret();
  if (expected.length === 0) {
    return false;
  }
  const given = Buffer.from(header ?? '');
  const right = Buffer.from(expected);
  if (given.length !== right.length) {
    return false;
  }
  return timingSafeEqual(given, right);
}
