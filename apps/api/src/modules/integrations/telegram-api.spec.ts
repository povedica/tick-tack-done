import { afterEach, expect, it, vi } from 'vitest';
import { TelegramApi } from './telegram-api.js';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('TTD-AUD-103: getMe username is cached and 403 is classified as blocked', async () => {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'synthetic-token');
  const fetcher = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ ok: true, result: { username: 'synthetic_bot' } })),
    ),
  );
  vi.stubGlobal('fetch', fetcher);
  const api = new TelegramApi();
  expect(await api.botUsername()).toBe('synthetic_bot');
  expect(await api.botUsername()).toBe('synthetic_bot');
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ ok: false, description: 'Forbidden: bot was blocked by the user' }),
      { status: 403 },
    ),
  );
  await expect(api.call('sendMessage', {})).rejects.toMatchObject({
    response: { code: 'telegram_blocked' },
  });
});
