import { describe, expect, it } from 'vitest';
import { isPublicListToken, newPublicListToken } from './public-list-token.js';

describe('public list token', () => {
  it('COMP-29: a token is 43 base64url characters and a thousand do not collide', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 1000; index += 1) {
      const token = newPublicListToken();
      expect(isPublicListToken(token)).toBe(true);
      expect(token).toHaveLength(43);
      seen.add(token);
    }
    expect(seen.size).toBe(1000);
  });

  it('COMP-29: a short or padded token is rejected before a lookup', () => {
    expect(isPublicListToken('abc')).toBe(false);
    expect(isPublicListToken(`${'a'.repeat(42)}=`)).toBe(false);
  });
});
