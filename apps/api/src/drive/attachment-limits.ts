import { DRIVE_INPUT_CHUNK_BYTES } from './drive-client.js';
import path from 'node:path';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../http/domain.exception.js';
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
export const ATTACHMENT_MAX_PER_TASK = 50;
export function attachmentByteLimit(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 100 * 1024 * 1024;
}
export const DRIVE_ATTACHMENT_MAX_BYTES = attachmentByteLimit(
  process.env.DRIVE_ATTACHMENT_MAX_BYTES,
);
/** Collect signature bytes across arbitrary stream boundaries; buffer at most 8000 + one bounded chunk. */
export async function attachmentPrefix(source: AsyncIterable<Uint8Array>) {
  const iterator = source[Symbol.asyncIterator]();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let done = false;
  try {
    while (length < 8000) {
      const next = await iterator.next();
      if (next.done) {
        done = true;
        break;
      }
      if (next.value.byteLength > DRIVE_INPUT_CHUNK_BYTES)
        throw new DomainException(
          413,
          'stream_chunk_too_large',
          'Stream chunk exceeds the memory bound',
        );
      if (next.value.byteLength === 0) continue;
      chunks.push(next.value);
      length += next.value.byteLength;
    }
    if (length === 0) throw new DomainException(400, 'empty_attachment', 'Empty attachment');
    const prefix = Buffer.alloc(Math.min(length, 8000));
    let offset = 0;
    for (const chunk of chunks) {
      const part = chunk.subarray(0, prefix.length - offset);
      prefix.set(part, offset);
      offset += part.length;
      if (offset === prefix.length) break;
    }
    async function* replay() {
      try {
        while(chunks.length){const chunk=chunks.shift();if(chunk)yield chunk;}
        if (!done)
          for (;;) {
            const next = await iterator.next();
            if (next.done) {
              done = true;
              return;
            }
            yield next.value;
          }
      } finally {
        if (!done) await iterator.return?.();
      }
    }
    return {
      prefix,
      replay,
      close: async () => {
        if (!done) {
          done = true;
          await iterator.return?.();
        }
      },
    };
  } catch (error) {
    if (!done) await iterator.return?.();
    throw error;
  }
}
export function safeFileName(name: string): string {
  const base = path
    .basename(name)
    .replace(/[^\w.\- ()[\]]/g, '_')
    .slice(0, 180);
  return base.length > 0 ? base : 'file';
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
