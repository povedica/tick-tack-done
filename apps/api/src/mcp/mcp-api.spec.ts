import { afterEach, expect, it, vi } from 'vitest';
import { requestPublicApi } from './mcp-api.js';

afterEach(() => vi.unstubAllGlobals());
it('RF-2001: preserves the bearer and returns HTTP authorization failures', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: { code: 'scope_missing' } }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetch);
  await expect(
    requestPublicApi(
      { method: 'PATCH', path: '/api/v1/focus/settings', body: { pomodoro_minutes: 15 } },
      'Bearer caller',
    ),
  ).rejects.toThrow();
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({
    headers: { Authorization: 'Bearer caller' },
    redirect: 'manual',
  });
});
it.each([
  'https://evil.test/api/v1/tasks',
  '/api/v1/mcp',
  '/api/v1/mcp/tools',
  '/api/v1/%6dcp',
  '/api/v1/../../oauth/token',
])('RF-2001: rejects recursive and non-public destinations %s', async (path) => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(requestPublicApi({ method: 'GET', path }, 'Bearer caller')).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
