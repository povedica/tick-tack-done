import { createHash } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception.js';

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

interface CursorPayload {
  s: string;
  i: string;
}

export function pageLimit(raw: unknown): number {
  if (raw === undefined || raw === '') {
    return 50;
  }
  const value = typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'limit must be an integer from 1 to 100',
    );
  }
  return value;
}

export function encodeCursor(sortOrder: string, id: string): string {
  const payload: CursorPayload = { s: sortOrder, i: id };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): { sortOrder: bigint; id: string } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('cursor');
    }
    const record = parsed as Record<string, unknown>;
    const sortOrder = record.s;
    const id = record.i;
    if (typeof sortOrder !== 'string' || typeof id !== 'string' || !/^\d+$/.test(sortOrder)) {
      throw new Error('cursor');
    }
    return { sortOrder: BigInt(sortOrder), id };
  } catch {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'cursor is invalid');
  }
}

export function slicePage<T extends { sort_order: string; id: string }>(
  rows: readonly T[],
  limit: number,
): Page<T> {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items: [...items],
    next_cursor: hasMore && last !== undefined ? encodeCursor(last.sort_order, last.id) : null,
  };
}

export function weakEtag(value: string): string {
  return `W/"${createHash('sha256').update(value).digest('base64url')}"`;
}

export function matchesEtag(header: string | undefined, etag: string): boolean {
  if (header === undefined || header.length === 0) {
    return false;
  }
  return header.split(',').some((part) => {
    const token = part.trim();
    return token === '*' || token === etag;
  });
}
