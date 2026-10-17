import { createHash } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../http/domain.exception';

export function requestFingerprint(method: string, path: string, body: unknown): string {
  return createHash('sha256')
    .update(`${method} ${path} ${JSON.stringify(body)}`)
    .digest('hex');
}

export function normalizeIdempotencyKey(key: string | undefined): string | undefined {
  if (key === undefined) {
    return undefined;
  }
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.length > 200) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'Idempotency-Key is too long',
    );
  }
  return trimmed;
}
