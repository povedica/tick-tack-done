import { Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertRuntimeConfig } from './runtime-config.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
function setup() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('AUTH_MODE', '');
  vi.stubEnv('APP_SECRET', randomBytes(32).toString('hex'));
  vi.stubEnv('PUBLIC_URL', 'https://staging.example.test');
  vi.stubEnv('VAPID_SUBJECT', 'mailto:admin@example.test');
  vi.stubEnv('RESEND_API_KEY', randomBytes(24).toString('hex'));
  vi.stubEnv('EMAIL_FROM', 'app@example.test');
  vi.stubEnv('SMTP_HOST', '');
  vi.stubEnv('SMTP_FROM', '');
}
describe('RF-802: production mail configuration', () => {
  it('starts with complete Resend configuration without requiring SMTP', () => {
    setup();
    expect(() => assertRuntimeConfig()).not.toThrow();
  });
  it('refuses a Resend key without its sender, even when SMTP exists', () => {
    setup();
    vi.stubEnv('EMAIL_FROM', '');
    vi.stubEnv('SMTP_HOST', 'mailpit');
    vi.stubEnv('SMTP_FROM', 'local@example.test');
    expect(() => assertRuntimeConfig()).toThrow('Configure RESEND_API_KEY and EMAIL_FROM');
  });
});
it('TTD-AUD-86 warns about ignored production legacy credentials without printing them', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('AUTH_MODE', 'session');
  vi.stubEnv('APP_SECRET', 'synthetic-runtime-key-for-local-test-only');
  vi.stubEnv('SMTP_HOST', 'mailpit');
  vi.stubEnv('SMTP_FROM', 'test@example.test');
  vi.stubEnv('VAPID_SUBJECT', 'mailto:test@example.test');
  vi.stubEnv('PUBLIC_URL', 'https://example.test');
  vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'synthetic-legacy-never-print');
  const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  assertRuntimeConfig();
  expect(warn).toHaveBeenCalledWith('GOOGLE_REFRESH_TOKEN ignored in production');
  expect(JSON.stringify(warn.mock.calls)).not.toContain('synthetic-legacy-never-print');
});

it('RF-2003: warns about both ignored legacy Telegram credentials without exposing values', () => {
  setup();
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'synthetic-bot-credential');
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'synthetic-webhook-credential');
  const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  assertRuntimeConfig();
  expect(warn).toHaveBeenCalledWith(
    'Variables de Telegram heredadas ignoradas: Telegram es por usuario.',
  );
  expect(JSON.stringify(warn.mock.calls)).not.toContain('synthetic-');
});
