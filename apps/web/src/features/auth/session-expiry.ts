import { ApiError } from '@reflexionia/sdk';
import { markSession } from './session';

const AUTH_PATHS = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/session',
  '/api/v1/auth/logout',
]);

/** TTD-AUD-29: send expired sessions to login with a return path. */
export function handleUnauthorized(path: string): void {
  if (AUTH_PATHS.has(path.split('?')[0] ?? path)) {
    return;
  }
  if (typeof window === 'undefined') {
    return;
  }
  markSession('anonymous');
  const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
  const target = `/login?next=${next}`;
  if (`${window.location.pathname}${window.location.search}` !== target) {
    window.location.assign(target);
  }
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
