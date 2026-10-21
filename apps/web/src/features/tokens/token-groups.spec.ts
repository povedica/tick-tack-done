import type { Token } from '@reflexionia/sdk';
import { describe, expect, it } from 'vitest';
import { groupTokens, tokenExpired } from './token-groups';

const token = (id: string, client: string | null): Token => ({
  id,
  name: id,
  oauth_client_id: client,
  client_name: client === null ? null : 'Same name',
  expires_at: null,
  token_prefix: 'test',
  scopes: ['tasks:read'],
  created_at: '2026-10-21T08:00:00.000Z',
  last_used_at: null,
  revoked_at: null,
});

describe('TTD-AUD-35 application groups', () => {
  it('RF-2002: groups by client id across loaded pages and retains every manual token', () => {
    const rows = [token('a', 'one'), token('m', null), token('b', 'one'), token('c', 'two')];
    const groups = groupTokens(rows);
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ['a', 'b'],
      ['m'],
      ['c'],
    ]);
    expect(groups.filter((group) => group.name === 'Same name')).toHaveLength(2);
  });
  it('TTD-AUD-36 RF-2002: no expiry stays active and an elapsed expiry is not active', () => {
    const now = Date.parse('2026-10-21T10:00:00.000Z');
    expect(tokenExpired(token('m', null), now)).toBe(false);
    expect(tokenExpired({ expires_at: '2026-10-21T09:59:00.000Z' }, now)).toBe(true);
    expect(tokenExpired({ expires_at: '2026-10-21T10:00:00.000Z' }, now)).toBe(true);
    expect(tokenExpired({ expires_at: '2026-10-21T10:01:00.000Z' }, now)).toBe(false);
  });
});
