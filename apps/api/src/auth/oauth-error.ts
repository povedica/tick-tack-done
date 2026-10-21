import type { DomainException } from '../http/domain.exception.js';

/** RFC 6749 §5.2 token-endpoint codes, plus temporarily_unavailable for rate limits. */
const TOKEN_CODES = new Set([
  'invalid_request',
  'invalid_client',
  'invalid_grant',
  'unauthorized_client',
  'unsupported_grant_type',
  'invalid_scope',
  'temporarily_unavailable',
]);

/** RFC 7591 §3.2.2 dynamic registration codes. */
const REGISTER_CODES = new Set([
  'invalid_redirect_uri',
  'invalid_client_metadata',
  'invalid_software_statement',
  'unapproved_software_statement',
  'invalid_request',
  'temporarily_unavailable',
]);

const TOO_MANY_REQUESTS = 429;

export interface OauthErrorBody {
  readonly error: string;
  readonly error_description: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isOauthProtocolPath(path: string): boolean {
  return (
    path === '/api/v1/oauth/token' ||
    path === '/api/v1/oauth/register' ||
    path === '/api/v1/oauth/revoke' ||
    path === '/oauth/token' ||
    path === '/oauth/register' ||
    path === '/oauth/revoke'
  );
}

export function isOauthRegisterPath(path: string): boolean {
  return path === '/api/v1/oauth/register' || path === '/oauth/register';
}

/** Map an internal API code onto an OAuth protocol error string. */
export function oauthProtocolError(code: string, path: string, status: number): string {
  if (status === TOO_MANY_REQUESTS || code === 'rate_limited') {
    return 'temporarily_unavailable';
  }
  if (isOauthRegisterPath(path)) {
    if (REGISTER_CODES.has(code)) {
      return code;
    }
    if (code === 'validation_failed') {
      return 'invalid_client_metadata';
    }
    return 'invalid_client_metadata';
  }
  if (TOKEN_CODES.has(code)) {
    return code;
  }
  if (code === 'validation_failed' || code === 'invalid_target') {
    return 'invalid_request';
  }
  return 'invalid_request';
}

export function oauthErrorBody(
  code: string,
  message: string,
  path: string,
  status: number,
): OauthErrorBody {
  return {
    error: oauthProtocolError(code, path, status),
    error_description: message,
  };
}

/** RFC 6749 §4.1.2.1 authorize redirect when redirect_uri is already validated. */
export function oauthAuthorizeErrorRedirect(
  redirectUri: string,
  state: string,
  code: string,
  description: string,
): string {
  const url = new URL(redirectUri);
  url.searchParams.set('error', code);
  url.searchParams.set('error_description', description);
  if (state.length > 0) {
    url.searchParams.set('state', state);
  }
  return url.toString();
}

export function authorizeErrorCode(exception: DomainException): string {
  const status = exception.getStatus();
  const body = exception.getResponse();
  const code =
    isRecord(body) && typeof body.code === 'string' ? body.code : 'invalid_request';
  if (status === TOO_MANY_REQUESTS || code === 'rate_limited') {
    return 'temporarily_unavailable';
  }
  if (code === 'access_denied') {
    return 'access_denied';
  }
  if (code === 'invalid_scope') {
    return 'invalid_scope';
  }
  if (code === 'unauthorized_client') {
    return 'unauthorized_client';
  }
  return 'invalid_request';
}

export function authorizeErrorDescription(exception: DomainException): string {
  const body = exception.getResponse();
  if (isRecord(body) && typeof body.message === 'string') {
    return body.message;
  }
  return 'Authorization request is invalid';
}
