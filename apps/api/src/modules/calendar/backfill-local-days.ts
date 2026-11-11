import type { PrismaClient } from '@prisma/client';
import { eventLocalDayColumns, taskLocalDayColumns } from '../../prisma/local-day-columns.js';
import { LOCAL_DAY_BATCH, writeLocalDays, type LocalDayColumns } from './local-day-batch.js';

interface TaskDayRow {
  id: string;
  startDate: Date | null;
  dueDate: Date | null;
  timeZone: string;
  localStartDay: Date | null;
  localEndDay: Date | null;
  updatedAt: Date;
}

interface EventDayRow {
  id: string;
  startsAt: Date;
  endsAt: Date | null;
  timeZone: string;
  isAllDay: boolean;
  localStartDay: Date | null;
  localEndDay: Date | null;
  updatedAt: Date;
}

/**
 * Fills local days on tasks and all-day events that already exist.
 * Timed events stay untouched: E-perfil rewrites them only when the profile zone changes.
 * The public calendar read path does not use these columns.
 */
export async function backfillLocalDays(
  prisma: PrismaClient,
  ownerId: string,
): Promise<{ tasks: number; events: number }> {
  const profileTimeZone = await profileZone(prisma, ownerId);
  const tasks = await eachBatch(
    (cursor) =>
      prisma.task.findMany({
        where: { ownerId },
        orderBy: { id: 'asc' },
        take: LOCAL_DAY_BATCH,
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
        select: {
          id: true,
          startDate: true,
          dueDate: true,
          timeZone: true,
          localStartDay: true,
          localEndDay: true,
          updatedAt: true,
        },
      }),
    (row) => writeTask(prisma, row),
  );
  const events = await eachBatch(
    (cursor) =>
      prisma.externalEvent.findMany({
        where: { ownerId, isAllDay: true },
        orderBy: { id: 'asc' },
        take: LOCAL_DAY_BATCH,
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          timeZone: true,
          isAllDay: true,
          localStartDay: true,
          localEndDay: true,
          updatedAt: true,
        },
      }),
    (row) => writeAllDayEvent(prisma, row, profileTimeZone),
  );
  return { tasks, events };
}

async function profileZone(prisma: PrismaClient, ownerId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { timeZone: true },
  });
  return user?.timeZone ?? 'UTC';
}

async function writeTask(prisma: PrismaClient, row: TaskDayRow): Promise<void> {
  const columns = taskColumns(row);
  await writeLocalDays(
    row,
    columns,
    async (updatedAt, data) => {
      const result = await prisma.task.updateMany({ where: { id: row.id, updatedAt }, data });
      return result.count;
    },
    () =>
      prisma.task.findUnique({
        where: { id: row.id },
        select: {
          id: true,
          startDate: true,
          dueDate: true,
          timeZone: true,
          localStartDay: true,
          localEndDay: true,
          updatedAt: true,
        },
      }),
    taskColumns,
  );
}

async function writeAllDayEvent(
  prisma: PrismaClient,
  row: EventDayRow,
  profileTimeZone: string,
): Promise<void> {
  await writeLocalDays(
    row,
    eventColumns(row, profileTimeZone),
    async (updatedAt, data) => {
      const result = await prisma.externalEvent.updateMany({
        where: { id: row.id, updatedAt },
        data,
      });
      return result.count;
    },
    () =>
      prisma.externalEvent.findUnique({
        where: { id: row.id },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          timeZone: true,
          isAllDay: true,
          localStartDay: true,
          localEndDay: true,
          updatedAt: true,
        },
      }),
    (fresh) => eventColumns(fresh, profileTimeZone),
  );
}

function taskColumns(row: TaskDayRow): LocalDayColumns {
  return taskLocalDayColumns({ start: row.startDate, due: row.dueDate, timeZone: row.timeZone });
}

function eventColumns(row: EventDayRow, profileTimeZone: string): LocalDayColumns {
  return eventLocalDayColumns({
    start: row.startsAt,
    end: row.endsAt,
    timeZone: row.timeZone,
    allDay: true,
    profileTimeZone,
  });
}

async function eachBatch<T extends { id: string }>(
  load: (cursor: string | undefined) => Promise<T[]>,
  handle: (row: T) => Promise<void>,
): Promise<number> {
  let cursor: string | undefined;
  let seen = 0;
  for (;;) {
    const rows = await load(cursor);
    if (rows.length === 0) {
      return seen;
    }
    for (const row of rows) {
      await handle(row);
    }
    seen += rows.length;
    const last = rows[rows.length - 1];
    if (rows.length < LOCAL_DAY_BATCH || last === undefined) {
      return seen;
    }
    cursor = last.id;
  }
}
