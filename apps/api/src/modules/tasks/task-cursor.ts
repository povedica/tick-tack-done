import { HttpStatus } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { isPriority, type Priority } from '@reflexionia/domain';
import { DomainException } from '../../http/domain.exception.js';

export type TaskSort = 'manual' | 'priority' | 'due';

const PRIORITY_ORDER: readonly Priority[] = ['high', 'medium', 'low', 'none'];

interface CursorRow {
  readonly id: string;
  readonly sortOrder: bigint;
  readonly priority: Priority;
  readonly dueDate: Date | null;
}

export function parseTaskSort(raw: string | undefined): TaskSort {
  if (raw === undefined || raw === '' || raw === 'manual') {
    return 'manual';
  }
  if (raw === 'priority' || raw === 'due') {
    return raw;
  }
  throw new DomainException(
    HttpStatus.BAD_REQUEST,
    'validation_failed',
    'sort must be manual, priority or due',
  );
}

export function taskOrderBy(sort: TaskSort): Prisma.TaskOrderByWithRelationInput[] {
  if (sort === 'priority') {
    return [{ priority: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }];
  }
  if (sort === 'due') {
    return [{ dueDate: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }, { id: 'asc' }];
  }
  return [{ sortOrder: 'asc' }, { id: 'asc' }];
}

export function encodeTaskCursor(sort: TaskSort, row: CursorRow): string {
  const payload: Record<string, string | null> = {
    k: sort,
    s: row.sortOrder.toString(),
    i: row.id,
  };
  if (sort === 'priority') {
    payload.p = row.priority;
  }
  if (sort === 'due') {
    payload.d = row.dueDate === null ? null : row.dueDate.toISOString();
  }
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function taskKeyset(
  sort: TaskSort,
  raw: string | undefined,
): Prisma.TaskWhereInput | undefined {
  if (raw === undefined || raw.length === 0) {
    return undefined;
  }
  const cursor = decode(raw);
  if (cursor.k !== sort) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'cursor does not match sort',
    );
  }
  if (sort === 'manual') {
    return afterManual(cursor.s, cursor.i);
  }
  if (sort === 'priority') {
    const priority = cursor.p ?? '';
    if (!isPriority(priority)) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'cursor is invalid');
    }
    return afterPriority(priority, cursor.s, cursor.i);
  }
  return afterDue(cursor.d ?? null, cursor.s, cursor.i);
}

function decode(raw: string): { k: string; s: bigint; i: string; p?: string; d?: string | null } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('cursor');
    }
    const record = parsed as Record<string, unknown>;
    const kind = record.k;
    const sortOrder = record.s;
    const id = record.i;
    if (typeof kind !== 'string' || typeof sortOrder !== 'string' || typeof id !== 'string') {
      throw new Error('cursor');
    }
    if (!/^\d+$/.test(sortOrder)) {
      throw new Error('cursor');
    }
    const priority = record.p;
    const due = record.d;
    return {
      k: kind,
      s: BigInt(sortOrder),
      i: id,
      ...(typeof priority === 'string' ? { p: priority } : {}),
      ...(due === null || typeof due === 'string' ? { d: due } : {}),
    };
  } catch (error) {
    if (error instanceof DomainException) {
      throw error;
    }
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'cursor is invalid');
  }
}

function afterManual(sortOrder: bigint, id: string): Prisma.TaskWhereInput {
  return {
    OR: [{ sortOrder: { gt: sortOrder } }, { sortOrder, id: { gt: id } }],
  };
}

function afterPriority(priority: Priority, sortOrder: bigint, id: string): Prisma.TaskWhereInput {
  const later = PRIORITY_ORDER.slice(PRIORITY_ORDER.indexOf(priority) + 1);
  return {
    OR: [
      ...(later.length > 0 ? [{ priority: { in: later } }] : []),
      { priority, sortOrder: { gt: sortOrder } },
      { priority, sortOrder, id: { gt: id } },
    ],
  };
}

function afterDue(due: string | null, sortOrder: bigint, id: string): Prisma.TaskWhereInput {
  if (due === null) {
    return {
      dueDate: null,
      OR: [{ sortOrder: { gt: sortOrder } }, { sortOrder, id: { gt: id } }],
    };
  }
  const dueDate = new Date(due);
  return {
    OR: [
      { dueDate: { gt: dueDate } },
      { dueDate, sortOrder: { gt: sortOrder } },
      { dueDate, sortOrder, id: { gt: id } },
      { dueDate: null },
    ],
  };
}
