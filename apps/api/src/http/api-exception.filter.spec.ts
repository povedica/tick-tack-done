import { HttpException, Logger } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { leaks, TRAP } from '../../test/helpers/pii-trap.js';
import { ApiExceptionFilter, maskPublicListPath } from './api-exception.filter.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('maskPublicListPath', () => {
  it('hides the public list token before it can reach a log', () => {
    const token = 'abcdefghijklmnopqrstuvwxyz0123456789-_ABC';
    expect(maskPublicListPath(`/api/v1/public/lists/${token}`)).toBe('/api/v1/public/lists/:token');
    expect(maskPublicListPath(`/api/v1/public/lists/${token}`)).not.toContain(token);
  });

  it('hides the iCal feed token too', () => {
    expect(maskPublicListPath(`/feeds/${TRAP.feedToken}.ics`)).toBe('/feeds/:token');
  });
});

function fakeHost(url: string) {
  const sent: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
      return this;
    },
    setHeader: vi.fn(),
    getHeader: (name: string) => (name === 'X-Request-Id' ? 'req-12345678' : undefined),
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: url, url }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, sent };
}

describe('ApiExceptionFilter logging', () => {
  it('CA-05: an unhandled error logs a scrubbed stack and the same 500 body as before', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, sent } = fakeHost(`/feeds/${TRAP.feedToken}?${TRAP.query}`);
    new ApiExceptionFilter().catch(
      new Error(`boom for ${TRAP.email} using Bearer ${TRAP.pat} and ${TRAP.session}`),
      host,
    );
    expect(sent).toEqual({
      status: 500,
      body: { error: { code: 'internal_error', message: 'Internal server error', details: null } },
    });
    expect(error).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(error.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(line).toMatchObject({
      event: 'unhandled_error',
      request_id: 'req-12345678',
      route: '/feeds/:token',
    });
    expect(String(error.mock.calls[0]?.[1])).toMatch(/\n {4}at /);
    expect(leaks(JSON.stringify(error.mock.calls))).toEqual([]);
  });

  it('a 4xx HttpException is not logged as an error', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, sent } = fakeHost('/api/v1/tasks');
    new ApiExceptionFilter().catch(new HttpException('nope', 404), host);
    expect(sent.status).toBe(404);
    expect(error).not.toHaveBeenCalled();
  });
});
