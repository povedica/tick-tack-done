import { createHash } from 'node:crypto';
import { secretsMatch } from './session-cookie';

/** S256: BASE64URL(SHA256(verifier)) equals the challenge. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (verifier.length < 43 || verifier.length > 128) {
    return false;
  }
  const digest = createHash('sha256').update(verifier).digest('base64url');
  return secretsMatch(digest, challenge);
}
