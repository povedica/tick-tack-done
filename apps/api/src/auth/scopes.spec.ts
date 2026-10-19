import { describe, expect, it } from 'vitest';
import { missingScopes } from './scopes.js';

describe('scopes', () => {
  it('RF-2002: reports the scopes a token was not granted', () => {
    expect(missingScopes(['tasks:read', 'tasks:write'], ['tasks:read'])).toEqual([]);
    expect(missingScopes(['tasks:read'], ['tasks:read', 'habits:write', 'lists:read'])).toEqual([
      'habits:write',
      'lists:read',
    ]);
  });
});
