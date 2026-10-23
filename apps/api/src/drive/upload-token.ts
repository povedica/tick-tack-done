import { createHmac, timingSafeEqual } from 'node:crypto';
import { DomainException } from '../http/domain.exception.js';
export interface UploadTicket {
  ownerId: string;
  taskId: string;
  folderId: string;
  nonce: string;
  name: string;
  mimeType: string;
  size: number;
  exp: number;
}
function secret(): string {
  const key = process.env.APP_SECRET ?? '';
  if (key.length >= 32) return key;
  if (process.env.NODE_ENV === 'production')
    throw new Error('APP_SECRET is required for signed Drive sessions');
  return 'development-only-drive-session-secret';
}
function mac(payload: string): string {
  return createHmac('sha256', secret())
    .update('ttd-drive-upload:' + payload)
    .digest('base64url');
}
export function signUpload(ticket: UploadTicket): string {
  const payload = Buffer.from(JSON.stringify(ticket)).toString('base64url');
  return `${payload}.${mac(payload)}`;
}
export function readUpload(token: string, ownerId: string, taskId: string): UploadTicket {
  const invalid = () =>
    new DomainException(400, 'invalid_upload_id', 'Upload id is invalid or expired');
  if (token.length > 4096) throw invalid();
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) throw invalid();
  const expected = Buffer.from(mac(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw invalid();
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  if (typeof value !== 'object' || value === null) throw invalid();
  const row = value as Partial<UploadTicket>;
  if (
    row.ownerId !== ownerId ||
    row.taskId !== taskId ||
    typeof row.exp !== 'number' ||
    row.exp <= Date.now() ||
    row.exp > Date.now() + 3600000 ||
    typeof row.size !== 'number' ||
    !Number.isSafeInteger(row.size) ||
    row.size <= 0 ||
    !['folderId', 'nonce', 'name', 'mimeType'].every(
      (key) => typeof (row as Record<string, unknown>)[key] === 'string',
    )
  )
    throw invalid();
  return row as UploadTicket;
}
