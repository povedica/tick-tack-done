/**
 * Section 10.1. `profile:write` is not in that list, but PATCH /api/v1/me and token
 * administration already declare it, so a PAT has to be able to name it.
 */
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

const KNOWN: ReadonlySet<string> = new Set(API_SCOPES);

export function isApiScope(value: string): value is ApiScope {
  return KNOWN.has(value);
}

/** Scopes the route requires and the caller was not granted (RF-2002). */
export function missingScopes(granted: readonly string[], required: readonly string[]): string[] {
  return required.filter((scope) => !granted.includes(scope));
}
