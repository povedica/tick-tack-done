import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultReminderChannel } from './reminder-channel.js';
afterEach(() => vi.unstubAllEnvs());
describe('TTD-AUD-115 RF-802 reminder channel', () => {
  it.each([
    [true, true, 'push'],
    [false, true, 'email'],
    [false, false, 'push'],
  ] as const)('push=%s email=%s => %s', (push, email, expected) => {
    vi.stubEnv('VAPID_PUBLIC_KEY', push ? 'synthetic' : '');
    vi.stubEnv('VAPID_PRIVATE_KEY', push ? 'synthetic' : '');
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('SMTP_HOST', email ? 'synthetic' : '');
    vi.stubEnv('SMTP_FROM', email ? 'synthetic@example.test' : '');
    expect(defaultReminderChannel()).toBe(expected);
  });
});
