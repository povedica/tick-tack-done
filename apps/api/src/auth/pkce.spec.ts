import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { pkceMatches } from './pkce';

describe('pkce', () => {
  it('accepts an S256 verifier and rejects a different one', () => {
    const verifier = 'a'.repeat(43);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    expect(pkceMatches(verifier, challenge)).toBe(true);
    expect(pkceMatches('b'.repeat(43), challenge)).toBe(false);
    expect(pkceMatches('short', challenge)).toBe(false);
  });
});
