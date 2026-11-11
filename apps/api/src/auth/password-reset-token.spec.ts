import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isWellFormedToken, newResetSecret } from './password-reset-token.js';

describe('RF-PR-03 password reset secret', () => {
  it('is 43 base64url characters and a sha256 hex hash', () => {
    const issued = newResetSecret();
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.hash).toBe(createHash('sha256').update(issued.token).digest('hex'));
    expect(isWellFormedToken(issued.token)).toBe(true);
    expect(isWellFormedToken('short')).toBe(false);
    expect(isWellFormedToken(`${issued.token}?token=1`)).toBe(false);
  });

  it('does not repeat across 10000 draws', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 10_000; index += 1) {
      seen.add(newResetSecret().token);
    }
    expect(seen.size).toBe(10_000);
  });
});
