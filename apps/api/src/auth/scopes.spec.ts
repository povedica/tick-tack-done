import { describe, expect, it } from 'vitest';
import { missingScopes, OAUTH_SCOPES } from './scopes.js';

describe('scopes', () => {
  it('RF-2002: reports the scopes a token was not granted', () => {
    expect(missingScopes(['tasks:read', 'tasks:write'], ['tasks:read'])).toEqual([]);
    expect(missingScopes(['tasks:read'], ['tasks:read', 'habits:write', 'lists:read'])).toEqual([
      'habits:write',
      'lists:read',
    ]);
  });
});

it('TTD-AUD-42 RF-2002: OAuth discovery advertises only externally grantable scopes', () => {
  expect(OAUTH_SCOPES).not.toContain('notifications:self:write');
  expect(OAUTH_SCOPES.some((scope) => scope.startsWith('ticky:'))).toBe(false);
  expect(OAUTH_SCOPES).toContain('countdowns:write');
});
