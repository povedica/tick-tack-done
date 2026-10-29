import type { PrismaClient } from '@prisma/client';
import { eventLocalDayColumns } from '../../prisma/local-day-columns.js';

const BATCH = 500;

/**
 * E-perfil: a profile timezone change rewrites timed events only.
 * Tasks stay on their capture zone. All-day events stay on their own zone.
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
      take: BATCH,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      select: { id: true, startsAt: true, endsAt: true, timeZone: true },
    });
    if (rows.length === 0) {
      return updated;
    }
    for (const row of rows) {
      await prisma.externalEvent.update({
        where: { id: row.id },
        data: eventLocalDayColumns({
          start: row.startsAt,
          end: row.endsAt,
          timeZone: row.timeZone,
          allDay: false,
          profileTimeZone,
        }),
      });
    }
    updated += rows.length;
    const last = rows[rows.length - 1];
    if (rows.length < BATCH || last === undefined) {
      return updated;
    }
    cursor = last.id;
  }
}
