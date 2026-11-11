import type { PrismaClient } from '@prisma/client';
import { entryLocalDays } from '@reflexionia/domain';
import { describe, expect, it } from 'vitest';
import { backfillLocalDays } from './backfill-local-days.js';
import { LOCAL_DAY_BATCH } from './local-day-batch.js';

const OWNER = 'owner-1';
const PROFILE = 'America/New_York';
const MADRID_ID = 'task-0000';

describe('backfillLocalDays', () => {
  it('fills tasks and all-day events in batches of 500 and leaves timed events', async () => {
    expect(LOCAL_DAY_BATCH).toBe(500);
    const store = memoryStore();
    const writes = { tasks: 0, events: 0 };
    const prisma = fakePrisma(store, writes);

    const first = await backfillLocalDays(prisma, OWNER);
    expect(first).toEqual({ tasks: LOCAL_DAY_BATCH + 1, events: 1 });
    expect(store.taskPages).toBe(2);
    expect(writes.tasks).toBe(LOCAL_DAY_BATCH + 1);
    expect(writes.events).toBe(1);

    const madrid = store.tasks.find((row) => row.id === MADRID_ID);
    const expected = entryLocalDays(
      {
        kind: 'task',
        start: '2026-10-19T22:30:00.000Z',
        due: null,
        timeZone: 'Europe/Madrid',
        allDay: false,
      },
      { profileTimeZone: PROFILE },
    );
    expect(expected?.start).toBe('2026-10-20');
    expect(day(madrid?.localStartDay ?? null)).toBe('2026-10-20');
    expect(day(madrid?.localEndDay ?? null)).toBe('2026-10-20');

    const allDay = store.events.find((row) => row.id === 'event-all-day');
    const inAuckland = entryLocalDays(
      {
        kind: 'event',
        start: '2026-03-09T11:00:00.000Z',
        end: '2026-03-10T11:00:00.000Z',
        timeZone: 'Pacific/Auckland',
        allDay: true,
      },
      { profileTimeZone: PROFILE },
    );
    const inProfile = entryLocalDays(
      {
        kind: 'event',
        start: '2026-03-09T11:00:00.000Z',
        end: '2026-03-10T11:00:00.000Z',
        timeZone: PROFILE,
        allDay: true,
      },
      { profileTimeZone: PROFILE },
    );
    expect(inAuckland?.start).not.toBe(inProfile?.start);
    expect(day(allDay?.localStartDay ?? null)).toBe(inAuckland?.start);
    expect(day(allDay?.localEndDay ?? null)).toBe(inAuckland?.end);

    const timed = store.events.find((row) => row.id === 'event-timed');
    expect(day(timed?.localStartDay ?? null)).toBe('1999-01-01');
    const otherOwner = store.tasks.find((row) => row.id === 'task-other');
    expect(otherOwner?.localStartDay).toBeNull();

    await backfillLocalDays(prisma, OWNER);
    expect(writes.tasks).toBe(LOCAL_DAY_BATCH + 1);
    expect(writes.events).toBe(1);
  });
});

function day(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}

interface TaskRow {
  id: string;
  ownerId: string;
  startDate: Date | null;
  dueDate: Date | null;
  timeZone: string;
  localStartDay: Date | null;
  localEndDay: Date | null;
  updatedAt: Date;
}

interface EventRow {
  id: string;
  ownerId: string;
  startsAt: Date;
  endsAt: Date | null;
  timeZone: string;
  isAllDay: boolean;
  localStartDay: Date | null;
  localEndDay: Date | null;
  updatedAt: Date;
}

function memoryStore(): {
  tasks: TaskRow[];
  events: EventRow[];
  taskPages: number;
  conflicts: Map<string, number>;
} {
  const tasks: TaskRow[] = [];
  for (let index = 0; index <= LOCAL_DAY_BATCH; index += 1) {
    const id = `task-${String(index).padStart(4, '0')}`;
    const madrid = id === MADRID_ID;
    tasks.push({
      id,
      ownerId: OWNER,
      startDate: madrid ? new Date('2026-10-19T22:30:00.000Z') : null,
      dueDate: madrid ? null : new Date('2026-06-01T10:00:00.000Z'),
      timeZone: madrid ? 'Europe/Madrid' : 'Europe/Madrid',
      localStartDay: null,
      localEndDay: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  }
  tasks.push({
    id: 'task-other',
    ownerId: 'owner-2',
    startDate: null,
    dueDate: new Date('2026-06-01T10:00:00.000Z'),
    timeZone: 'Europe/Madrid',
    localStartDay: null,
    localEndDay: null,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  return {
    tasks,
    taskPages: 0,
    conflicts: new Map([[MADRID_ID, 1]]),
    events: [
      {
        id: 'event-all-day',
        ownerId: OWNER,
        startsAt: new Date('2026-03-09T11:00:00.000Z'),
        endsAt: new Date('2026-03-10T11:00:00.000Z'),
        timeZone: 'Pacific/Auckland',
        isAllDay: true,
        localStartDay: null,
        localEndDay: null,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'event-timed',
        ownerId: OWNER,
        startsAt: new Date('2026-10-19T22:30:00.000Z'),
        endsAt: new Date('2026-10-19T23:30:00.000Z'),
        timeZone: 'Europe/Madrid',
        isAllDay: false,
        localStartDay: new Date('1999-01-01T00:00:00.000Z'),
        localEndDay: new Date('1999-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  };
}

function fakePrisma(
  store: ReturnType<typeof memoryStore>,
  writes: { tasks: number; events: number },
): PrismaClient {
  return {
    user: {
      findUnique: () => Promise.resolve({ timeZone: PROFILE }),
    },
    task: {
      findMany: (args: {
        where: { ownerId: string };
        take: number;
        cursor?: { id: string };
        skip?: number;
      }) => {
        store.taskPages += 1;
        return page(
          store.tasks.filter((row) => row.ownerId === args.where.ownerId),
          args,
        );
      },
      findUnique: (args: { where: { id: string } }) =>
        Promise.resolve(store.tasks.find((row) => row.id === args.where.id) ?? null),
      updateMany: (args: {
        where: { id: string; updatedAt: Date };
        data: { localStartDay: Date | null; localEndDay: Date | null };
      }) => applyUpdate(store.tasks, store.conflicts, writes, 'tasks', args),
    },
    externalEvent: {
      findMany: (args: {
        where: { ownerId: string; isAllDay: boolean };
        take: number;
        cursor?: { id: string };
        skip?: number;
      }) =>
        page(
          store.events.filter(
            (row) => row.ownerId === args.where.ownerId && row.isAllDay === args.where.isAllDay,
          ),
          args,
        ),
      findUnique: (args: { where: { id: string } }) =>
        Promise.resolve(store.events.find((row) => row.id === args.where.id) ?? null),
      updateMany: (args: {
        where: { id: string; updatedAt: Date };
        data: { localStartDay: Date | null; localEndDay: Date | null };
      }) => applyUpdate(store.events, store.conflicts, writes, 'events', args),
    },
  } as unknown as PrismaClient;
}

function page<T extends { id: string }>(
  rows: T[],
  args: { take: number; cursor?: { id: string }; skip?: number },
): T[] {
  const ordered = [...rows].sort((left, right) => (left.id < right.id ? -1 : 1));
  const start =
    args.cursor === undefined
      ? 0
      : ordered.findIndex((row) => row.id === args.cursor?.id) + (args.skip ?? 0);
  return ordered.slice(start, start + args.take);
}

interface MutableDay {
  id: string;
  updatedAt: Date;
  localStartDay: Date | null;
  localEndDay: Date | null;
}

function applyUpdate(
  rows: MutableDay[],
  conflicts: Map<string, number>,
  writes: { tasks: number; events: number },
  kind: 'tasks' | 'events',
  args: {
    where: { id: string; updatedAt: Date };
    data: { localStartDay: Date | null; localEndDay: Date | null };
  },
): { count: number } {
  const row = rows.find((item) => item.id === args.where.id);
  if (row === undefined) {
    return { count: 0 };
  }
  if (row.updatedAt.getTime() !== args.where.updatedAt.getTime()) {
    return { count: 0 };
  }
  const left = conflicts.get(row.id) ?? 0;
  if (left > 0) {
    conflicts.set(row.id, left - 1);
    row.updatedAt = new Date(row.updatedAt.getTime() + 1_000);
    return { count: 0 };
  }
  row.localStartDay = args.data.localStartDay;
  row.localEndDay = args.data.localEndDay;
  row.updatedAt = new Date(row.updatedAt.getTime() + 1_000);
  writes[kind] += 1;
  return { count: 1 };
}
