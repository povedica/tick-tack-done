import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { entryLocalDays } from '@reflexionia/domain';
import { describe, expect, it } from 'vitest';
import { backfillLocalDays } from '../modules/calendar/backfill-local-days.js';
import { assertEphemeralDatabase, PROFILE_X100 } from './fixture.js';
import { main as seedPerf } from './seed-perf.js';

const parity = process.env.PERF_PARITY === '1';

/**
 * Acceptance for F4 on the disposable x100 seed.
 * Skipped unless PERF_PARITY=1 and DATABASE_URL names reflexionia_perf.
 * Does not read the public calendar and does not declare the columns active.
 */
describe.skipIf(!parity)('F4 local-day parity on the x100 seed', () => {
  it(
    'matches entryLocalDays after backfilling tasks and all-day events',
    async () => {
      const databaseUrl = process.env.DATABASE_URL ?? '';
      assertEphemeralDatabase(databaseUrl, process.env.PERF_SEED);
      const directory = mkdtempSync(path.join(tmpdir(), 'ttd-f4-'));
      process.env.PERF_PROFILE = 'x100';
      process.env.PERF_MANIFEST = path.join(directory, 'manifest.json');
      process.env.PERF_TOKEN_FILE = path.join(directory, 'token');
      process.env.PERF_SESSION_FILE = path.join(directory, 'session.json');
      if ((process.env.PERF_SEED_PASSWORD ?? '').length < 12) {
        process.env.PERF_SEED_PASSWORD = 'perf-parity-password';
      }
      await seedPerf();

      const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
      try {
        const owner = await prisma.user.findUnique({
          where: { email: 'perf-seed@example.test' },
          select: { id: true, timeZone: true },
        });
        if (owner === null) {
          throw new Error('seed-perf did not insert the owner');
        }
        const allDay = await prisma.externalEvent.count({
          where: { ownerId: owner.id, isAllDay: true },
        });
        await prisma.task.updateMany({
          where: { ownerId: owner.id },
          data: { localStartDay: null, localEndDay: null },
        });
        await prisma.externalEvent.updateMany({
          where: { ownerId: owner.id, isAllDay: true },
          data: { localStartDay: null, localEndDay: null },
        });
        expect(await nullColumns(prisma, owner.id, 'tasks')).toBe(PROFILE_X100.tasks);
        expect(await nullColumns(prisma, owner.id, 'all-day')).toBe(allDay);
        expect(await nullColumns(prisma, owner.id, 'timed')).toBe(0);

        const filled = await backfillLocalDays(prisma, owner.id);
        expect(filled).toEqual({ tasks: PROFILE_X100.tasks, events: allDay });
        expect(await nullColumns(prisma, owner.id, 'tasks')).toBe(0);
        expect(await nullColumns(prisma, owner.id, 'all-day')).toBe(0);
        expect(await nullColumns(prisma, owner.id, 'timed')).toBe(0);

        const mismatches = await collectMismatches(prisma, owner.id, owner.timeZone);
        if (mismatches.total > 0) {
          throw new Error(
            `${String(mismatches.total)} local-day mismatches\n${mismatches.samples.join('\n')}`,
          );
        }
      } finally {
        await prisma.$disconnect();
      }
    },
    10 * 60_000,
  );
});

type Kind = 'tasks' | 'all-day' | 'timed';

async function nullColumns(prisma: PrismaClient, ownerId: string, kind: Kind): Promise<number> {
  if (kind === 'tasks') {
    return prisma.task.count({
      where: {
        ownerId,
        OR: [{ localStartDay: null }, { localEndDay: null }],
      },
    });
  }
  return prisma.externalEvent.count({
    where: {
      ownerId,
      isAllDay: kind === 'all-day',
      OR: [{ localStartDay: null }, { localEndDay: null }],
    },
  });
}

async function collectMismatches(
  prisma: PrismaClient,
  ownerId: string,
  profileTimeZone: string,
): Promise<{ total: number; samples: string[] }> {
  const mismatches = { total: 0, samples: [] as string[] };
  await scanTasks(prisma, ownerId, profileTimeZone, mismatches);
  await scanEvents(prisma, ownerId, profileTimeZone, mismatches);
  return mismatches;
}

function noteMismatch(
  mismatches: { total: number; samples: string[] },
  storedStart: string | null,
  storedEnd: string | null,
  start: string | null,
  end: string | null,
  label: string,
): void {
  if (storedStart === start && storedEnd === end) {
    return;
  }
  mismatches.total += 1;
  if (mismatches.samples.length < 5) {
    mismatches.samples.push(
      `${label}: stored ${storedStart ?? 'null'}..${storedEnd ?? 'null'}, domain ${start ?? 'null'}..${end ?? 'null'}`,
    );
  }
}

async function scanTasks(
  prisma: PrismaClient,
  ownerId: string,
  profileTimeZone: string,
  mismatches: { total: number; samples: string[] },
): Promise<void> {
  let cursor: string | null = null;
  for (;;) {
    const rows: TaskParityRow[] =
      cursor === null
        ? await prisma.$queryRaw<TaskParityRow[]>(Prisma.sql`
            SELECT id::text AS id,
                   start_date AS "startDate",
                   due_date AS "dueDate",
                   time_zone AS "timeZone",
                   local_start_day::text AS "localStartDay",
                   local_end_day::text AS "localEndDay"
            FROM tasks
            WHERE owner_id = ${ownerId}::uuid
            ORDER BY id
            LIMIT 500
          `)
        : await prisma.$queryRaw<TaskParityRow[]>(Prisma.sql`
            SELECT id::text AS id,
                   start_date AS "startDate",
                   due_date AS "dueDate",
                   time_zone AS "timeZone",
                   local_start_day::text AS "localStartDay",
                   local_end_day::text AS "localEndDay"
            FROM tasks
            WHERE owner_id = ${ownerId}::uuid
              AND id > ${cursor}::uuid
            ORDER BY id
            LIMIT 500
          `);
    if (rows.length === 0) {
      return;
    }
    for (const row of rows) {
      const span = entryLocalDays(
        {
          kind: 'task',
          start: row.startDate?.toISOString() ?? null,
          due: row.dueDate?.toISOString() ?? null,
          timeZone: row.timeZone,
          allDay: false,
        },
        { profileTimeZone },
      );
      const start = span?.start ?? null;
      const end = span?.end ?? null;
      noteMismatch(mismatches, row.localStartDay, row.localEndDay, start, end, `task ${row.id}`);
    }
    const last = rows[rows.length - 1];
    if (rows.length < 500 || last === undefined) {
      return;
    }
    cursor = last.id;
  }
}

async function scanEvents(
  prisma: PrismaClient,
  ownerId: string,
  profileTimeZone: string,
  mismatches: { total: number; samples: string[] },
): Promise<void> {
  let cursor: string | null = null;
  for (;;) {
    const rows: EventParityRow[] =
      cursor === null
        ? await prisma.$queryRaw<EventParityRow[]>(Prisma.sql`
            SELECT id::text AS id,
                   starts_at AS "startsAt",
                   ends_at AS "endsAt",
                   is_all_day AS "isAllDay",
                   time_zone AS "timeZone",
                   local_start_day::text AS "localStartDay",
                   local_end_day::text AS "localEndDay"
            FROM external_events
            WHERE owner_id = ${ownerId}::uuid
            ORDER BY id
            LIMIT 500
          `)
        : await prisma.$queryRaw<EventParityRow[]>(Prisma.sql`
            SELECT id::text AS id,
                   starts_at AS "startsAt",
                   ends_at AS "endsAt",
                   is_all_day AS "isAllDay",
                   time_zone AS "timeZone",
                   local_start_day::text AS "localStartDay",
                   local_end_day::text AS "localEndDay"
            FROM external_events
            WHERE owner_id = ${ownerId}::uuid
              AND id > ${cursor}::uuid
            ORDER BY id
            LIMIT 500
          `);
    if (rows.length === 0) {
      return;
    }
    for (const row of rows) {
      const span = entryLocalDays(
        {
          kind: 'event',
          start: row.startsAt.toISOString(),
          end: row.endsAt?.toISOString() ?? null,
          timeZone: row.timeZone,
          allDay: row.isAllDay,
        },
        { profileTimeZone },
      );
      const start = span?.start ?? null;
      const end = span?.end ?? null;
      noteMismatch(mismatches, row.localStartDay, row.localEndDay, start, end, `event ${row.id}`);
    }
    const last = rows[rows.length - 1];
    if (rows.length < 500 || last === undefined) {
      return;
    }
    cursor = last.id;
  }
}

interface TaskParityRow {
  id: string;
  startDate: Date | null;
  dueDate: Date | null;
  timeZone: string;
  localStartDay: string | null;
  localEndDay: string | null;
}

interface EventParityRow {
  id: string;
  startsAt: Date;
  endsAt: Date | null;
  isAllDay: boolean;
  timeZone: string;
  localStartDay: string | null;
  localEndDay: string | null;
}
