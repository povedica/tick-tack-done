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

it('TTD-AUD-85.1: preserves HTTP status, stable code and structured error body', async () => {
  request.mockReset();
  request.mockImplementation((_options: unknown, callback: (incoming: Readable) => void) => {
    const incoming = Object.assign(
      Readable.from([
        Buffer.from(
          JSON.stringify({
            error: {
              code: 'task_not_found',
              message: 'Task was not found',
              details: { pending: 1 },
            },
          }),
        ),
      ]),
      { statusCode: 404, headers: { 'content-type': 'application/json' } },
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
      { method: 'GET', path: '/api/v1/tasks/00000000-0000-4000-8000-000000000000' },
      'Bearer synthetic',
    ),
  ).rejects.toMatchObject({
    status: 404,
    response: {
      code: 'task_not_found',
      details: {
        status: 404,
        code: 'task_not_found',
        message: 'Task was not found',
        pending: 1,
        body: { error: { code: 'task_not_found' } },
      },
    },
  });
});

it('TTD-AUD-99 streams multipart encoding in bounded fragments instead of materializing a file', async () => {
  const sizes: number[] = [];
  request.mockReset();
  request.mockImplementation((_options: unknown, callback: (incoming: Readable) => void) => ({
    on: vi.fn(),
    write: (chunk: Buffer) => {
      sizes.push(chunk.length);
      return true;
    },
    end: () => {
      callback(
        Object.assign(Readable.from([Buffer.from('{"id":"file"}')]), {
          statusCode: 201,
          headers: { 'content-type': 'application/json' },
        }),
      );
    },
  }));
  await requestPublicApi(
    {
      method: 'POST',
      path: '/api/v1/tasks/task/attachments',
      files: [
        {
          field: 'file',
          filename: 'x.txt',
          base64: Buffer.alloc(8 * 1024 * 1024 + 4, 97).toString('base64'),
          content_type: 'text/plain',
        },
      ],
    },
    'Bearer caller',
  );
  expect(sizes.length).toBeGreaterThan(100);
  expect(Math.max(...sizes)).toBeLessThanOrEqual(64 * 1024);
  expect(request.mock.calls[0]?.[0]).toMatchObject({ headers: { 'X-TTD-Source': 'mcp' } });
});
