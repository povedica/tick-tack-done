import { createHash, randomBytes } from 'node:crypto';

const PREFIX_LENGTH = 16;

export interface IssuedToken {
  readonly token: string;
  readonly hash: string;
  readonly prefix: string;
}

export type BearerHeader =
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'token'; readonly token: string };

/** RF-2002. The plaintext is shown once. Only the SHA-256 hash is stored. */
export function newPersonalAccessToken(): IssuedToken {
  const token = `rfx_pat_${randomBytes(32).toString('base64url')}`;
  return { token, hash: hashPersonalAccessToken(token), prefix: token.slice(0, PREFIX_LENGTH) };
}

export function hashPersonalAccessToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * A present Authorization header is a PAT attempt. An invalid header does not
 * fall through to the dev user, so a PAT cannot inherit that pass.
 */
export function parseBearer(header: string | undefined): BearerHeader {
  if (header === undefined || header.trim().length === 0) {
    return { kind: 'absent' };
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  const token = match?.[1];
  if (token === undefined || token.length < 20 || token.length > 500) {
    return { kind: 'invalid' };
  }
  return { kind: 'token', token };
}
