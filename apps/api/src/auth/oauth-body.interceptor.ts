import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';

const REGISTER_KEYS = [
  'redirect_uris',
  'client_name',
  'token_endpoint_auth_method',
  'grant_types',
  'response_types',
] as const;

const TOKEN_KEYS = [
  'grant_type',
  'code',
  'redirect_uri',
  'client_id',
  'code_verifier',
  'refresh_token',
  'scope',
  'resource',
  'client_secret',
] as const;

const REVOKE_KEYS = ['token', 'token_type_hint'] as const;

/** RFC 7591 says ignore unknown client metadata. The global pipe rejects unknown fields. */
@Injectable()
export class OauthBodyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      body?: unknown;
      method?: string;
      originalUrl?: string;
      url?: string;
    }>();
    if (request.method === 'POST' && isRecord(request.body)) {
      const path = (request.originalUrl ?? request.url ?? '').split('?')[0] ?? '';
      const keys = keysFor(path);
      if (keys !== null) {
        request.body = pick(request.body, keys);
      }
    }
    return next.handle();
  }
}

function keysFor(path: string): readonly string[] | null {
  if (path.endsWith('/oauth/register')) {
    return REGISTER_KEYS;
  }
  if (path.endsWith('/oauth/token')) {
    return TOKEN_KEYS;
  }
  if (path.endsWith('/oauth/revoke')) {
    return REVOKE_KEYS;
  }
  return null;
}

function pick(body: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in body) {
      next[key] = body[key];
    }
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
