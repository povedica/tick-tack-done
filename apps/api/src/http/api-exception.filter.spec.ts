import { HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { DomainException } from './domain.exception.js';
import { ApiExceptionFilter } from './api-exception.filter.js';

function hostFor(path: string): {
  host: ArgumentsHost;
  statusCode: { value: number };
  body: { value: unknown };
  headers: Record<string, string>;
} {
  const statusCode = { value: 0 };
  const body = { value: undefined as unknown };
  const headers: Record<string, string> = {};
  const response = {
    status(code: number) {
      statusCode.value = code;
      return this;
    },
    json(payload: unknown) {
      body.value = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: path, url: path }),
      getResponse: () => response,
    }),
  } as ArgumentsHost;
  return { host, statusCode, body, headers };
}

describe('ApiExceptionFilter OAuth protocol bodies', () => {
  it('returns RFC-shaped errors on /oauth/token and keeps Retry-After', () => {
    const filter = new ApiExceptionFilter();
    const token = hostFor('/api/v1/oauth/token');
    filter.catch(
      new DomainException(HttpStatus.BAD_REQUEST, 'invalid_grant', 'code_verifier mismatch'),
      token.host,
    );
    expect(token.statusCode.value).toBe(400);
    expect(token.body.value).toEqual({
      error: 'invalid_grant',
      error_description: 'code_verifier mismatch',
    });

    const limited = hostFor('/oauth/token');
    filter.catch(
      new DomainException(HttpStatus.TOO_MANY_REQUESTS, 'rate_limited', 'Too many requests', {
        retry_after: 42,
      }),
      limited.host,
    );
    expect(limited.statusCode.value).toBe(429);
    expect(limited.headers['Retry-After']).toBe('42');
    expect(limited.body.value).toEqual({
      error: 'temporarily_unavailable',
      error_description: 'Too many requests',
    });
  });

  it('returns RFC 7591 bodies on /oauth/register', () => {
    const filter = new ApiExceptionFilter();
    const { host, statusCode, body } = hostFor('/api/v1/oauth/register');
    filter.catch(
      new DomainException(HttpStatus.BAD_REQUEST, 'invalid_redirect_uri', 'redirect_uri is not allowed'),
      host,
    );
    expect(statusCode.value).toBe(400);
    expect(body.value).toEqual({
      error: 'invalid_redirect_uri',
      error_description: 'redirect_uri is not allowed',
    });
  });

  it('keeps the internal API envelope outside OAuth protocol routes', () => {
    const filter = new ApiExceptionFilter();
    const { host, statusCode, body } = hostFor('/api/v1/tasks');
    filter.catch(
      new DomainException(HttpStatus.TOO_MANY_REQUESTS, 'rate_limited', 'Too many requests', {
        retry_after: 9,
      }),
      host,
    );
    expect(statusCode.value).toBe(429);
    expect(body.value).toEqual({
      error: {
        code: 'rate_limited',
        message: 'Too many requests',
        details: { retry_after: 9 },
      },
    });
  });

  it('does not rewrite /api/v1/oauth/authorize (consent UI) to the OAuth protocol shape', () => {
    const filter = new ApiExceptionFilter();
    const { host, body } = hostFor('/api/v1/oauth/authorize');
    filter.catch(
      new DomainException(HttpStatus.BAD_REQUEST, 'invalid_client', 'OAuth client was not found'),
      host,
    );
    expect(body.value).toEqual({
      error: {
        code: 'invalid_client',
        message: 'OAuth client was not found',
        details: null,
      },
    });
  });
});
