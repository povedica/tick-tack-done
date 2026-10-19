import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../http/domain.exception';

export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
export const ATTACHMENT_USER_QUOTA_BYTES = 2 * 1024 * 1024 * 1024;
export const ATTACHMENT_MAX_PER_TASK = 50;

const STORAGE_KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}$/i;

export function attachmentRoot(): string {
  return process.env.ATTACHMENT_DIR ?? path.join(process.cwd(), 'data', 'attachments');
}

export function safeFileName(name: string): string {
  const base = path
    .basename(name)
    .replace(/[^\w.\- ()[\]]/g, '_')
    .slice(0, 180);
  return base.length > 0 ? base : 'file';
}

export function resolveAttachment(storageKey: string): string {
  if (!STORAGE_KEY.test(storageKey)) {
    throw new DomainException(
      HttpStatus.NOT_FOUND,
      'attachment_not_found',
      'Attachment was not found',
    );
  }
  const root = path.resolve(attachmentRoot());
  const absolute = path.resolve(root, storageKey);
  if (!absolute.startsWith(`${root}${path.sep}`)) {
    throw new DomainException(
      HttpStatus.NOT_FOUND,
      'attachment_not_found',
      'Attachment was not found',
    );
  }
  return absolute;
}

/** Images, PDF, Office and plain text. The stored type comes from the bytes, not the client (S-18). */
export function acceptedMime(bytes: Buffer): string {
  const sniffed = sniffMime(bytes);
  if (sniffed === null) {
    throw new DomainException(
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      'unsupported_media_type',
      'File type is not allowed',
    );
  }
  return sniffed;
}

function sniffMime(bytes: Buffer): string | null {
  if (starts(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (starts(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return 'image/gif';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  if (starts(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    const text = bytes.subarray(0, Math.min(bytes.length, 8000)).toString('latin1');
    if (text.includes('word/')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (text.includes('xl/')) {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    if (text.includes('ppt/')) {
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    }
    return null;
  }
  if (isPlainText(bytes)) {
    return 'text/plain';
  }
  return null;
}

function starts(bytes: Buffer, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) {
    return false;
  }
  return magic.every((value, index) => bytes[index] === value);
}

function isPlainText(bytes: Buffer): boolean {
  if (bytes.length === 0 || bytes.includes(0)) {
    return false;
  }
  const sample = bytes
    .subarray(0, Math.min(bytes.length, 512))
    .toString('utf8')
    .trimStart()
    .toLowerCase();
  if (
    sample.startsWith('<!doctype') ||
    sample.startsWith('<html') ||
    sample.startsWith('<svg') ||
    sample.startsWith('<?xml') ||
    sample.startsWith('<script')
  ) {
    return false;
  }
  return true;
}

export async function writeAttachment(ownerId: string, bytes: Buffer): Promise<string> {
  const key = `${ownerId}/${randomUUID()}`;
  const absolute = resolveAttachment(key);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);
  return key;
}

export async function removeAttachmentFile(storageKey: string): Promise<void> {
  await unlink(resolveAttachment(storageKey)).catch(() => undefined);
}
