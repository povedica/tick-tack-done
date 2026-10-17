import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../http/domain.exception';

export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

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
