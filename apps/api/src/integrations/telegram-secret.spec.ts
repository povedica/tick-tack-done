import { describe, expect, it } from 'vitest';
import { telegramSecretMatches, telegramWebhookSecret } from './telegram-secret';

describe('telegram webhook secret', () => {
  it('RF-2003: the header is a hex digest, not the bot token', () => {
    const token = '123456:secret';
    const secret = telegramWebhookSecret(token);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(secret.includes(token)).toBe(false);
    expect(telegramSecretMatches(secret, token)).toBe(true);
    expect(telegramSecretMatches(token, token)).toBe(false);
    expect(telegramSecretMatches(undefined, token)).toBe(false);
  });
});
