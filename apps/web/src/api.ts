import { createApiClient, type ApiClientOptions } from '@reflexionia/sdk';
import { DEV_USER_EMAIL } from './config';
import { handleUnauthorized } from './features/auth/session-expiry';
import { readCsrfToken } from './features/auth/session';

export const sessionMode = import.meta.env.VITE_AUTH_MODE === 'session';

export function apiOptions(): ApiClientOptions {
  if (sessionMode) {
    return {
      baseUrl: '',
      credentials: 'include',
      csrfToken: readCsrfToken,
      onUnauthorized: handleUnauthorized,
    };
  }
  return { baseUrl: '', devUserEmail: DEV_USER_EMAIL };
}

export const api = createApiClient(apiOptions());
