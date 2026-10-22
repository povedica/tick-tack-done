import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception.js';
export function offsetOf(cursor: unknown): number {
  if (cursor === undefined) return 0;
  try {
    if (typeof cursor !== 'string' || cursor.length > 512) throw new Error('cursor');
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof value !== 'object' ||
      value === null ||
      !('offset' in value) ||
      typeof value.offset !== 'number' ||
      !Number.isSafeInteger(value.offset) ||
      value.offset < 0 ||
      value.offset > 100_000
    )
      throw new Error('cursor');
    return value.offset;
  } catch {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'invalid_cursor', 'Invalid opaque cursor');
  }
}
export function offsetCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString('base64url');
}
export function offsetPage<T>(
  rows: readonly T[],
  offset: number,
  limit: number,
): { items: T[]; next_cursor: string | null } {
  return {
    items: rows.slice(offset, offset + limit),
    next_cursor: rows.length > offset + limit ? offsetCursor(offset + limit) : null,
  };
}
