import { expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('node:http', () => ({ request }));
import { requestPublicApi } from './mcp-api.js';

it('RF-2001: preserves the bearer and returns HTTP authorization failures', async () => {
  request.mockReset();
  request.mockImplementation((_options: unknown, callback: (incoming: Readable) => void) => {
    const incoming = Object.assign(
      Readable.from([Buffer.from(JSON.stringify({ error: { code: 'scope_missing' } }))]),
      {
        statusCode: 403,
        headers: { 'content-type': 'application/json' },
      },
    );
    return {
      on: vi.fn(),
      end: () => {
        callback(incoming);
      },
    };
  });
  await expect(
    requestPublicApi(
      { method: 'PATCH', path: '/api/v1/focus/settings', body: { pomodoro_minutes: 15 } },
      'Bearer caller',
    ),
  ).rejects.toThrow();
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/v1/focus/settings',
    headers: { Authorization: 'Bearer caller' },
  });
});
it.each([
  'https://evil.test/api/v1/tasks',
  '/api/v1/mcp',
  '/api/v1/mcp/tools',
  '/api/v1/%6dcp',
  '/api/v1/../../oauth/token',
  '//evil.test/api/v1/tasks',
  '/api/v1/%255c%255cevil.test',
])('RF-2001: rejects recursive and non-public destinations %s', async (path) => {
  request.mockClear();
  await expect(requestPublicApi({ method: 'GET', path }, 'Bearer caller')).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
