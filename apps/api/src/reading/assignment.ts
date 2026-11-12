import { HttpStatus } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { DomainException } from '../http/domain.exception.js';
import { optionalUuid } from '../http/uuid-query.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { Tx } from '../prisma/tx.js';

type Db = PrismaService | Tx;

export interface AssignmentActorJson {
  id: string;
  name: string;
  avatar_url: string | null;
}

export interface AssignmentJson {
  assigned_by: AssignmentActorJson;
  assigned_at: string;
  unread: boolean;
}

export interface AssignmentEvent {
  readonly action: 'assigned' | 'accessed';
  readonly actorId: string;
  readonly createdAt: Date;
}

export interface AssignmentSubject {
  readonly id: string;
  readonly assigneeId: string | null;
}

/** Newest `assigned` event, if the task was ever assigned. */
export function latestAssignment(
  events: readonly AssignmentEvent[],
): { actorId: string; createdAt: Date } | null {
  let best: { actorId: string; createdAt: Date } | null = null;
  for (const event of events) {
    if (event.action !== 'assigned') {
      continue;
    }
    if (best === null || event.createdAt > best.createdAt) {
      best = { actorId: event.actorId, createdAt: event.createdAt };
    }
  }
  return best;
}

/**
 * Null when the task has no assignee or no assignment event.
 * `unread` is true only for the assignee, until they open the task after the last assignment.
 */
export function assignmentOf(input: {
  readonly assigneeId: string | null;
  readonly viewerId: string;
  readonly events: readonly AssignmentEvent[];
  readonly actors: ReadonlyMap<string, { name: string; avatarUrl: string | null }>;
}): AssignmentJson | null {
  if (input.assigneeId === null) {
    return null;
  }
  const latest = latestAssignment(input.events);
  if (latest === null) {
    return null;
  }
  const actor = input.actors.get(latest.actorId);
  const seen = input.events.some(
    (event) =>
      event.action === 'accessed' &&
      event.actorId === input.assigneeId &&
      event.createdAt > latest.createdAt,
  );
  return {
    assigned_by: {
      id: latest.actorId,
      name: actor?.name ?? '',
      avatar_url: actor?.avatarUrl ?? null,
    },
    assigned_at: latest.createdAt.toISOString(),
    unread: input.assigneeId === input.viewerId && !seen,
  };
}

/** Task ids whose latest `assigned` event still belongs to this actor. */
export function keptAssignedBy(
  actorId: string,
  rows: readonly { entityId: string; actorId: string; createdAt: Date }[],
): string[] {
  const latest = new Map<string, { actorId: string; createdAt: Date }>();
  for (const row of rows) {
    const current = latest.get(row.entityId);
    if (current === undefined || row.createdAt > current.createdAt) {
      latest.set(row.entityId, { actorId: row.actorId, createdAt: row.createdAt });
    }
  }
  return [...latest.entries()].filter(([, value]) => value.actorId === actorId).map(([id]) => id);
}

export async function taskIdsLastAssignedBy(db: Db, actorId: string): Promise<string[]> {
  const mine = await db.activityLog.findMany({
    where: { entityType: 'task', action: 'assigned', actorId, deletedAt: null },
    select: { entityId: true },
    distinct: ['entityId'],
  });
  const ids = mine.map((row) => row.entityId);
  if (ids.length === 0) {
    return [];
  }
  const rows = await db.activityLog.findMany({
    where: {
      entityType: 'task',
      entityId: { in: ids },
      action: 'assigned',
      deletedAt: null,
    },
    select: { entityId: true, actorId: true, createdAt: true },
  });
  return keptAssignedBy(actorId, rows);
}

export async function loadAssignmentMap(
  db: Db,
  viewerId: string,
  tasks: readonly AssignmentSubject[],
): Promise<Map<string, AssignmentJson | null>> {
  const result = new Map<string, AssignmentJson | null>();
  const pending = tasks.filter((task) => task.assigneeId !== null);
  for (const task of tasks) {
    if (task.assigneeId === null) {
      result.set(task.id, null);
    }
  }
  if (pending.length === 0) {
    return result;
  }
  const ids = pending.map((task) => task.id);
  const logs = await db.activityLog.findMany({
    where: {
      entityType: 'task',
      entityId: { in: ids },
      action: { in: ['assigned', 'accessed'] },
      deletedAt: null,
    },
    select: { entityId: true, action: true, actorId: true, createdAt: true },
  });
  const byTask = new Map<string, AssignmentEvent[]>();
  for (const log of logs) {
    if (log.action !== 'assigned' && log.action !== 'accessed') {
      continue;
    }
    const current = byTask.get(log.entityId) ?? [];
    current.push({ action: log.action, actorId: log.actorId, createdAt: log.createdAt });
    byTask.set(log.entityId, current);
  }
  const actorIds = [
    ...new Set(
      [...byTask.values()].flatMap((events) => {
        const latest = latestAssignment(events);
        return latest === null ? [] : [latest.actorId];
      }),
    ),
  ];
  const users =
    actorIds.length === 0
      ? []
      : await db.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, displayName: true, avatar: true },
        });
  const actors = new Map(
    users.map((user) => [user.id, { name: user.displayName, avatarUrl: user.avatar }]),
  );
  for (const task of pending) {
    result.set(
      task.id,
      assignmentOf({
        assigneeId: task.assigneeId,
        viewerId,
        events: byTask.get(task.id) ?? [],
        actors,
      }),
    );
  }
  return result;
}

/** `me`, `none`, or a uuid. Undefined when the query param is absent. */
export function assigneeFilter(raw: unknown, userId: string): { id: string | null } | undefined {
  const value = personToken(raw, 'assignee', true, userId);
  return value === undefined ? undefined : { id: value };
}

/** `me` or a uuid. The current assignee must be someone else. */
export function assignedByActor(raw: unknown, userId: string): string | undefined {
  const value = personToken(raw, 'assigned_by', false, userId);
  return typeof value === 'string' ? value : undefined;
}

function personToken(
  raw: unknown,
  field: 'assignee' | 'assigned_by',
  allowNone: boolean,
  userId: string,
): string | null | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', `${field} is invalid`);
  }
  if (raw === 'me') {
    return userId;
  }
  if (allowNone && raw === 'none') {
    return null;
  }
  const id = optionalUuid(raw, field);
  if (id === undefined) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', `${field} is invalid`);
  }
  return id;
}

/** Tasks this actor assigned that are still someone else's. */
export function assignedByWhere(
  actorId: string,
  taskIds: readonly string[],
): Prisma.TaskWhereInput {
  if (taskIds.length === 0) {
    return { id: '00000000-0000-0000-0000-000000000000' };
  }
  return {
    id: { in: [...taskIds] },
    assigneeId: { not: null },
    NOT: { assigneeId: actorId },
  };
}
