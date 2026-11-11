import { randomBytes } from 'node:crypto';

/** COMP-29. 32 bytes, base64url, no padding: 43 characters. */
export const PUBLIC_LIST_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function newPublicListToken(): string {
  return randomBytes(32).toString('base64url');
}

export function isPublicListToken(value: string): boolean {
  return PUBLIC_LIST_TOKEN.test(value);
}
