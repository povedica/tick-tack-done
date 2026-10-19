/**
 * Section 10.1. `account:admin` is a browser-session scope: it is not in `API_SCOPES`,
 * so a personal access token cannot be created with it (S-15).
 */
export const ACCOUNT_ADMIN_SCOPE = 'account:admin';

export const API_SCOPES = [
  'tasks:read',
  'tasks:write',
  'lists:read',
  'lists:write',
  'tags:read',
  'tags:write',
  'filters:read',
  'filters:write',
  'habits:read',
  'habits:write',
  'countdowns:read',
  'countdowns:write',
  'focus:read',
  'focus:write',
  'notes:read',
  'notes:write',
  'calendar:read',
  'calendar:write',
  'reminders:write',
  'webhooks:manage',
  'automations:manage',
  'profile:read',
  'profile:write',
  'backup:read',
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

/** Scopes a browser session or the dev header receives. Includes account administration. */
export const SESSION_SCOPES = [...API_SCOPES, ACCOUNT_ADMIN_SCOPE] as const;

const PAT_SCOPES: ReadonlySet<string> = new Set(API_SCOPES);

export function isApiScope(value: string): value is ApiScope {
  return PAT_SCOPES.has(value);
}

/** Scopes the route requires and the caller was not granted (RF-2002). */
export function missingScopes(granted: readonly string[], required: readonly string[]): string[] {
  return required.filter((scope) => !granted.includes(scope));
}
