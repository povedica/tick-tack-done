import { HttpStatus } from '@nestjs/common';
import { ATTACHMENT_MAX_BYTES } from '../../drive/attachment-limits.js';
import { DomainException } from '../../http/domain.exception.js';

const MIME = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;

function stripControls(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127) {
      continue;
    }
    out += char;
  }
  return out;
}

function hasControl(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}

export interface InboundFile {
  readonly originalname: string;
  readonly mimetype: string;
  readonly size: number;
  readonly buffer: Buffer;
}

/** Strip controls. The body is stored as text and never executed. */
export function untrustedText(
  value: unknown,
  max: number,
  field: string,
  required: boolean,
): string {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        `${field} is required`,
      );
    }
    return '';
  }
  if (typeof value !== 'string') {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', `${field} is invalid`);
  }
  const cleaned = stripControls(value);
  if (cleaned.length > max) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', `${field} is too long`);
  }
  return cleaned;
}

export function optionalToken(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string' || value.length > 200 || hasControl(value)) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'message_id is invalid');
  }
  return value;
}

export function safeMime(value: string): string {
  const mime = value.trim().toLowerCase();
  if (mime.length <= 127 && MIME.test(mime)) {
    return mime;
  }
  return 'application/octet-stream';
}

export function assertInboundFiles(files: readonly InboundFile[]): void {
  if (files.length > 10) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'too many attachments');
  }
  for (const file of files) {
    if (file.buffer.length === 0 || file.buffer.length > ATTACHMENT_MAX_BYTES) {
      throw new DomainException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        'payload_too_large',
        'Attachment exceeds the size limit',
      );
    }
  }
}
