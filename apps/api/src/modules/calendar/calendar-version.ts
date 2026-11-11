import { Prisma } from '@prisma/client';
import { DomainEvent } from '../../events/domain-events.js';
import type { Tx } from '../../prisma/tx.js';

const TASK_EVENTS = new Set<string>([
  DomainEvent.taskCreated,
  DomainEvent.taskUpdated,
  DomainEvent.taskCompleted,
  DomainEvent.taskReopened,
  DomainEvent.taskUncompleted,
  DomainEvent.taskCancelled,
  DomainEvent.taskDeleted,
  DomainEvent.taskRestored,
  DomainEvent.taskMoved,
  DomainEvent.taskSomedaySet,
  DomainEvent.taskSomedayUnset,
  DomainEvent.occurrenceDetached,
  DomainEvent.seriesClosed,
]);

const CALENDAR_EVENTS = new Set<string>([
  DomainEvent.projectUpdated,
  DomainEvent.projectDeleted,
  DomainEvent.calendarSubscriptionUpdated,
  DomainEvent.calendarSubscriptionDeleted,
  DomainEvent.calendarSubscriptionResynced,
  DomainEvent.calendarEventImported,
  DomainEvent.calendarSynced,
  DomainEvent.planApplied,
  DomainEvent.planShutdownApplied,
  DomainEvent.planReplanApplied,
]);

/**
 * True when this event can change what summary or range would return.
 * Reminders, comments and a Google disconnect that keeps events do not.
 * The local-day backfill does not bump: activation owns that cut.
 */
export function calendarVersionEvent(type: string, data: Prisma.InputJsonValue): boolean {
  if (TASK_EVENTS.has(type) || CALENDAR_EVENTS.has(type)) {
    return true;
  }
  return type === DomainEvent.googleDisconnected && importedEventsRemoved(data);
}

export async function readCalendarVersion(
  db: { $queryRaw: Tx['$queryRaw'] },
  ownerId: string,
): Promise<bigint> {
  const rows = await db.$queryRaw<{ version: bigint | number | string }[]>(Prisma.sql`
    SELECT version FROM calendar_versions WHERE owner_id = CAST(${ownerId} AS uuid)
  `);
  const version = rows[0]?.version;
  if (typeof version === 'bigint') {
    return version;
  }
  if (typeof version === 'number' || typeof version === 'string') {
    return BigInt(version);
  }
  return 0n;
}

/** Same transaction as the write. Missing row starts at 1. */
export async function bumpCalendarVersion(tx: Tx, ownerId: string): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO calendar_versions (owner_id, version, updated_at)
    VALUES (CAST(${ownerId} AS uuid), 1, NOW())
    ON CONFLICT (owner_id) DO UPDATE
    SET version = calendar_versions.version + 1,
        updated_at = NOW()
  `);
}

function importedEventsRemoved(data: Prisma.InputJsonValue): boolean {
  const record = jsonRecord(data);
  if (record === null) {
    return false;
  }
  const google = jsonRecord(record.google);
  return google?.imported_events_removed === true;
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
