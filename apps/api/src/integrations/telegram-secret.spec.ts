import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { telegramSecretMatches } from './telegram-secret.js';

describe('telegram webhook secret', () => {
  it('RF-2003: matches only the explicit secret stored for this bot', () => {
    const secret = randomBytes(32).toString('hex');
    expect(telegramSecretMatches(secret, secret)).toBe(true);
    expect(telegramSecretMatches(randomBytes(32).toString('hex'), secret)).toBe(false);
    expect(telegramSecretMatches(undefined, secret)).toBe(false);
    expect(telegramSecretMatches(secret, '')).toBe(false);
  });
});
