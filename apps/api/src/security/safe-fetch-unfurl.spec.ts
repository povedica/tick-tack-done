import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('node:http', () => ({ default: { request } }));
vi.mock('node:https', () => ({ default: { request } }));
import { safeFetch } from './safe-fetch.js';
const lookup = vi.fn(() => Promise.resolve({ address: '1.1.1.1', family: 4 }));
function respond(status: number, headers: Record<string, string>, body = '') {
  request.mockImplementationOnce((_options: unknown, callback: (res: unknown) => void) => {
    const req = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: (error?: Error) => void;
    };
    req.destroy = (error) => {
      req.emit('close');
      if (error) req.emit('error', error);
    };
    req.end = () => {
      const res = new EventEmitter() as EventEmitter & {
        statusCode: number;
        headers: Record<string, string>;
        destroy: () => void;
      };
      res.statusCode = status;
      res.headers = headers;
      res.destroy = () => { res.removeAllListeners(); };
      callback(res);
      queueMicrotask(() => {
        res.emit('data', Buffer.from(body));
        res.emit('end');
        req.emit('close');
      });
    };
    return req;
  });
}
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
it('TTD-AUD-100: pins public DNS and blocks private redirects before connecting again', async () => {
  respond(302, { location: 'http://10.0.0.1/' });
  await expect(
    safeFetch('https://example.test/', {
      maxBytes: 262144,
      timeoutMs: 3000,
      maxRedirects: 3,
      allowHttp: true,
      lookup,
    }),
  ).rejects.toThrow(/not an allowed/);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    host: '1.1.1.1',
    headers: { host: 'example.test' },
  });
});
it('TTD-AUD-100: rejects non HTML and bodies over 256KiB', async () => {
  respond(200, { 'content-type': 'image/png' }, 'x');
  await expect(
    safeFetch('https://example.test/', { maxBytes: 262144, contentType: 'text/html', lookup }),
  ).rejects.toThrow();
  respond(200, { 'content-type': 'text/html' }, 'x'.repeat(262145));
  await expect(
    safeFetch('https://example.test/', { maxBytes: 262144, contentType: 'text/html', lookup }),
  ).rejects.toThrow(/large/);
});
it('TTD-AUD-100: permits three redirects and enforces an overall DNS deadline', async () => {
  for (let index = 0; index < 3; index++)
    respond(302, { location: `https://example.test/${index}` });
  respond(200, { 'content-type': 'text/html' }, '<title>OK</title>');
  expect(
    (await safeFetch('https://example.test/', { maxBytes: 262144, maxRedirects: 3, lookup }))
      .status,
  ).toBe(200);
  vi.useFakeTimers();
  const slow = safeFetch('https://example.test/', {
    maxBytes: 262144,
    timeoutMs: 3000,
    lookup: () => new Promise(() => { /* Simulate DNS that never settles. */ }),
  });
  const failed = expect(slow).rejects.toThrow(/deadline/);
  await vi.advanceTimersByTimeAsync(3000);
  await failed;
});
