import { describe, expect, it } from 'vitest';
import { DomainException } from '../http/domain.exception.js';
import { HttpStatus } from '@nestjs/common';
import {
  authorizeErrorCode,
  isOauthProtocolPath,
  oauthAuthorizeErrorRedirect,
  oauthErrorBody,
  oauthProtocolError,
} from './oauth-error.js';

describe('oauth error format', () => {
  it('recognizes token, register and revoke protocol paths', () => {
    expect(isOauthProtocolPath('/api/v1/oauth/token')).toBe(true);
    expect(isOauthProtocolPath('/oauth/register')).toBe(true);
    expect(isOauthProtocolPath('/api/v1/oauth/revoke')).toBe(true);
    expect(isOauthProtocolPath('/api/v1/oauth/authorize')).toBe(false);
    expect(isOauthProtocolPath('/api/v1/tasks')).toBe(false);
  });

  it('serializes RFC 6749 §5.2 bodies with error as a string', () => {
    expect(
      oauthErrorBody('invalid_grant', 'Authorization code is invalid', '/api/v1/oauth/token', 400),
    ).toEqual({
      error: 'invalid_grant',
      error_description: 'Authorization code is invalid',
    });
  });

  it('maps rate_limited to temporarily_unavailable on OAuth protocol paths', () => {
    expect(oauthProtocolError('rate_limited', '/api/v1/oauth/token', 429)).toBe(
      'temporarily_unavailable',
    );
    expect(oauthErrorBody('rate_limited', 'Too many requests', '/oauth/token', 429)).toEqual({
      error: 'temporarily_unavailable',
      error_description: 'Too many requests',
    });
  });

  it('maps registration validation onto RFC 7591 codes', () => {
    expect(oauthProtocolError('invalid_redirect_uri', '/api/v1/oauth/register', 400)).toBe(
      'invalid_redirect_uri',
    );
    expect(oauthProtocolError('validation_failed', '/api/v1/oauth/register', 400)).toBe(
      'invalid_client_metadata',
    );
  });

  it('builds authorize redirects only with query error params', () => {
    const location = oauthAuthorizeErrorRedirect(
      'http://127.0.0.1:8080/cb',
      'state-1',
      'invalid_request',
      'Invalid authorize request',
    );
    const url = new URL(location);
    expect(url.origin + url.pathname).toBe('http://127.0.0.1:8080/cb');
    expect(url.searchParams.get('error')).toBe('invalid_request');
    expect(url.searchParams.get('error_description')).toBe('Invalid authorize request');
    expect(url.searchParams.get('state')).toBe('state-1');
  });

  it('maps DomainException rate limits to temporarily_unavailable for authorize', () => {
    const exception = new DomainException(
      HttpStatus.TOO_MANY_REQUESTS,
      'rate_limited',
      'Too many requests',
      { retry_after: 12 },
    );
    expect(authorizeErrorCode(exception)).toBe('temporarily_unavailable');
  });
});
