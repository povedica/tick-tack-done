import { Logger } from '@nestjs/common';
import { afterEach, expect, it, vi } from 'vitest';
import { assertRuntimeConfig } from './runtime-config.js';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it('TTD-AUD-86 warns about ignored production legacy credentials without printing them', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('AUTH_MODE', 'session');
  vi.stubEnv('APP_SECRET', 'synthetic-runtime-key-for-local-test-only');
  vi.stubEnv('SMTP_FROM', 'test@example.test');
  vi.stubEnv('VAPID_SUBJECT', 'mailto:test@example.test');
  vi.stubEnv('PUBLIC_URL', 'https://example.test');
  vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'synthetic-legacy-never-print');
  const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  assertRuntimeConfig();
  expect(warn).toHaveBeenCalledWith('GOOGLE_REFRESH_TOKEN ignored in production');
  expect(JSON.stringify(warn.mock.calls)).not.toContain('synthetic-legacy-never-print');
});
