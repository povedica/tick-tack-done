import { afterEach, describe, expect, it, vi } from 'vitest';
import { webhookUrl } from './telegram-settings.service.js';

afterEach(() => vi.unstubAllEnvs());
describe('RF-2003: public Telegram webhook URL', () => {
  it.each([
    '',
    'bad',
    'http://todo.example.org',
    'https://localhost',
    'https://127.0.0.1',
    'https://10.0.0.1',
    'https://[::1]',
    'https://dev.localhost',
    'https://internal',
    'https://user:pass@todo.example.org',
    'https://todo.example.org:3000',
  ])('keeps %s local-only', (value) => {
    vi.stubEnv('PUBLIC_URL', value);
    expect(webhookUrl('owner')).toBeNull();
  });
  it('builds an independent route per user without query parameters', () => {
    vi.stubEnv('PUBLIC_URL', 'https://todo.example.org:8443/path?ignored=1');
    expect(webhookUrl('owner')).toBe(
      'https://todo.example.org:8443/api/v1/integrations/telegram/webhook/owner',
    );
  });
});
