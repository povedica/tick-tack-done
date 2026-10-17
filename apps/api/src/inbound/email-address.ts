import { createHash, randomBytes } from 'node:crypto';

/** RF-105. The local part is the secret. Only its hash is stored. */
export const INBOUND_EMAIL_DOMAIN = 'in.todo.reflexionia.com';

const LOCAL_PART = /^[A-Za-z0-9_-]{20,128}$/;

export function newInboundToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashInboundToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function inboundAddress(token: string): string {
  return `${token}@${INBOUND_EMAIL_DOMAIN}`;
}

/** Returns the secret local part, or null when the address is not ours. */
export function inboundLocalPart(recipient: string): string | null {
  const trimmed = recipient.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || trimmed.includes(',')) {
    return null;
  }
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (domain !== INBOUND_EMAIL_DOMAIN || !LOCAL_PART.test(local)) {
    return null;
  }
  return local;
}
