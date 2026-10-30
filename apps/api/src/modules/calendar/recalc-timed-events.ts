import type { PrismaClient } from '@prisma/client';
import { eventLocalDayColumns } from '../../prisma/local-day-columns.js';
import { bumpCalendarVersion } from './calendar-version.js';
import { LOCAL_DAY_BATCH, writeLocalDays } from './local-day-batch.js';

interface TimedEventRow {
  id: string;
  startsAt: Date;
  endsAt: Date | null;
  timeZone: string;
  localStartDay: Date | null;
  localEndDay: Date | null;
  updatedAt: Date;
}

/**
 * E-perfil: a profile timezone change rewrites timed events only.
 * Tasks stay on their capture zone. All-day events stay on their own zone.
 * A newer edit of the same row is reread and is not overwritten.
 */
export async function recalcTimedEventLocalDays(
  prisma: PrismaClient,
  ownerId: string,
  profileTimeZone: string,
): Promise<number> {
  let updated = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.externalEvent.findMany({
      where: { ownerId, isAllDay: false, deletedAt: null },
      orderBy: { id: 'asc' },
      take: LOCAL_DAY_BATCH,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        timeZone: true,
        localStartDay: true,
        localEndDay: true,
        updatedAt: true,
      },
    });
    if (rows.length === 0) {
      return updated;
    }
    for (const row of rows) {
      await writeTimedEvent(prisma, ownerId, row, profileTimeZone);
    }
    updated += rows.length;
    const last = rows[rows.length - 1];
    if (rows.length < LOCAL_DAY_BATCH || last === undefined) {
      return updated;
    }
    cursor = last.id;
  }
}

async function writeTimedEvent(
  prisma: PrismaClient,
  ownerId: string,
  row: TimedEventRow,
  profileTimeZone: string,
): Promise<void> {
  const select = {
    id: true,
    startsAt: true,
    endsAt: true,
    timeZone: true,
    localStartDay: true,
    localEndDay: true,
    updatedAt: true,
  } as const;
  await writeLocalDays(
    row,
    columnsOf(row, profileTimeZone),
    async (updatedAt, data) =>
      prisma.$transaction(async (tx) => {
        const result = await tx.externalEvent.updateMany({
          where: { id: row.id, updatedAt, deletedAt: null },
          data,
        });
        if (result.count > 0) {
          await bumpCalendarVersion(tx, ownerId);
        }
        return result.count;
      }),
    () => prisma.externalEvent.findFirst({ where: { id: row.id, deletedAt: null }, select }),
    (fresh) => columnsOf(fresh, profileTimeZone),
  );
}

function columnsOf(row: TimedEventRow, profileTimeZone: string) {
  return eventLocalDayColumns({
    start: row.startsAt,
    end: row.endsAt,
    timeZone: row.timeZone,
    allDay: false,
    profileTimeZone,
  });
}
