import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const PREFIX = 'enc1:';

export function sealField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, data]).toString('base64url');
}

export function openField(stored: string): string {
  if (!stored.startsWith(PREFIX)) {
    return stored;
  }
  const packed = Buffer.from(stored.slice(PREFIX.length), 'base64url');
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const data = packed.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function isSealed(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

function encryptionKey(): Buffer {
  const dedicated = process.env.DATA_ENCRYPTION_KEY ?? '';
  if (/^[0-9a-f]{64}$/i.test(dedicated)) {
    return Buffer.from(dedicated, 'hex');
  }
  const secret = process.env.APP_SECRET ?? '';
  if (process.env.NODE_ENV === 'production' && secret.length < 32) {
    throw new Error('APP_SECRET must be at least 32 characters to encrypt stored secrets');
  }
  const ikm = secret.length >= 32 ? secret : 'dev-only-field-key-not-for-production!!';
  return Buffer.from(hkdfSync('sha256', ikm, 'reflexionia-field', 'data-encryption', 32));
}
