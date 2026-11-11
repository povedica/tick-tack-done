import { hashSecret } from './session-cookie.js';
import { randomBytes } from 'node:crypto';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,64}$/;

/** RF-PR-03. 32 bytes, base64url. Only the SHA-256 hex is stored. */
export function newResetSecret(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashSecret(token) };
}

export function isWellFormedToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}
