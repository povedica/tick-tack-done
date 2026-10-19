import { afterEach, describe, expect, it } from 'vitest';
import { telegramSecretMatches, telegramWebhookSecret } from './telegram-secret';

describe('telegram webhook secret', () => {
  const previous = process.env.TELEGRAM_WEBHOOK_SECRET;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
    } else {
      process.env.TELEGRAM_WEBHOOK_SECRET = previous;
    }
  });

  it('matches only the configured secret, not the bot token', () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'webhook_secret_value';
    expect(telegramWebhookSecret()).toBe('webhook_secret_value');
    expect(telegramSecretMatches('webhook_secret_value')).toBe(true);
    expect(telegramSecretMatches('123456:telegram-bot-token')).toBe(false);
    expect(telegramSecretMatches(undefined)).toBe(false);
  });
});
