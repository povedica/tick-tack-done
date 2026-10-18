import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'rfx_session';
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface IssuedSession {
  readonly token: string;
  readonly hash: string;
  readonly csrf: string;
}

export function newSessionSecret(): IssuedSession {
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(32).toString('base64url');
  return { token, hash: hashSecret(token), csrf };
}

export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function secretsMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sessionCookieOptions(): {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  };
}
