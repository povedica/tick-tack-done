/**
 * Section 10.1. `account:admin` is a browser-session scope: it is not in `API_SCOPES`,
 * so a personal access token cannot be created with it (S-15).
 */
export const ACCOUNT_ADMIN_SCOPE = 'account:admin';

export const API_SCOPES = [
  'tasks:read',
  'tasks:write',
  'tasks:create',
  'tasks:update',
  'tasks:complete',
  'tasks:trash',
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
  'focus:start',
  'focus:stop',
  'notes:read',
  'notes:write',
  'calendar:read',
  'calendar:write',
  'reminders:write',
  'notifications:self:write',
  'ticky:proposals:read',
  'ticky:proposals:write',
  'ticky:routines:read',
  'ticky:routines:write',
  'webhooks:manage',
  'automations:manage',
  'profile:read',
  'profile:write',
  'backup:read',
  'stats:read',
] as const;

/**
 * Legacy coarse scopes do not grant Ticky fine action scopes.
 * `tasks:write` still satisfies ordinary task write routes via explicit route scopes.
 */
export const LEGACY_SCOPE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'focus:write': ['focus:read', 'focus:write'],
};

export type ApiScope = (typeof API_SCOPES)[number];

/** Scopes a browser session or the dev header receives. Includes account administration. */
export const SESSION_SCOPES = [...API_SCOPES, ACCOUNT_ADMIN_SCOPE] as const;

const PAT_SCOPES: ReadonlySet<string> = new Set(API_SCOPES);

export function isApiScope(value: string): value is ApiScope {
  return PAT_SCOPES.has(value);
}

/** External OAuth clients cannot request the app's internal notification/Ticky scopes. */
export const OAUTH_SCOPES = API_SCOPES.filter(
  (scope) => !scope.startsWith('ticky:') && scope !== 'notifications:self:write',
);
const EXTERNAL_SCOPES: ReadonlySet<string> = new Set(OAUTH_SCOPES);
export function isOauthScope(value: string): value is ApiScope {
  return EXTERNAL_SCOPES.has(value);
}

/** Ordinary scopes offered when the client omits scope; sensitive permissions need an explicit request. */
export const OAUTH_DEFAULT_SCOPES = [
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
  'focus:read',
  'focus:write',
  'notes:read',
  'notes:write',
  'calendar:read',
  'calendar:write',
  'reminders:write',
  'profile:read',
  'stats:read',
] as const satisfies readonly ApiScope[];

/** Scopes the route requires and the caller was not granted (RF-2002). */
export function missingScopes(granted: readonly string[], required: readonly string[]): string[] {
  return required.filter((scope) => !granted.includes(scope));
}
