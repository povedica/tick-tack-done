import type { PrismaClient } from '@prisma/client';
import { entryLocalDays } from '@reflexionia/domain';
import { describe, expect, it } from 'vitest';
import { enqueueTimedRecalcJob, runTimedRecalc, type LocalDayJobQueue } from './local-day-queue.js';

describe('timed event recalc queue', () => {
  it('enqueues one job and ignores a duplicate so the request can return', async () => {
    const added: { name: string; ownerId: string; jobId: string | undefined }[] = [];
    const queue: LocalDayJobQueue = {
      add: (name, data, opts) => {
        added.push({ name, ownerId: data.ownerId, jobId: opts.jobId });
        return Promise.resolve();
      },
    };
    await enqueueTimedRecalcJob(queue, 'owner-1');
    expect(added).toEqual([
      { name: 'timed-recalc', ownerId: 'owner-1', jobId: 'timed-recalc:owner-1' },
    ]);

    const duplicate: LocalDayJobQueue = {
      add: () => Promise.reject(new Error('Job timed-recalc:owner-1 already exists')),
    };
    await expect(enqueueTimedRecalcJob(duplicate, 'owner-1')).resolves.toBeUndefined();
  });

  it('re-reads the profile zone when it changes during the pass', async () => {
    const event = {
      id: 'event-1',
      startsAt: new Date('2026-10-19T22:30:00.000Z'),
      endsAt: new Date('2026-10-19T23:00:00.000Z'),
      timeZone: 'Europe/Madrid',
      localStartDay: null as Date | null,
      localEndDay: null as Date | null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null as Date | null,
    };
    let zone = 'Europe/Madrid';
    let reads = 0;
    const db = {
      $executeRaw: () => Promise.resolve(0),
      $transaction: (fn: (tx: unknown) => Promise<number>) => fn(db),
      user: {
        findUnique: () => {
          reads += 1;
          if (reads === 2) {
            zone = 'America/New_York';
          }
          return Promise.resolve({ timeZone: zone });
        },
      },
      externalEvent: {
        findMany: () => Promise.resolve([event]),
        findFirst: () => Promise.resolve(event),
        updateMany: (args: {
          where: { updatedAt: Date };
          data: { localStartDay: Date; localEndDay: Date };
        }) => {
          if (args.where.updatedAt.getTime() !== event.updatedAt.getTime()) {
            return { count: 0 };
          }
          event.localStartDay = args.data.localStartDay;
          event.localEndDay = args.data.localEndDay;
          event.updatedAt = new Date(event.updatedAt.getTime() + 1_000);
          return { count: 1 };
        },
      },
    } as unknown as PrismaClient;

    await runTimedRecalc(db, 'owner-1');
    const span = entryLocalDays(
      {
        kind: 'event',
        start: '2026-10-19T22:30:00.000Z',
        end: '2026-10-19T23:00:00.000Z',
        timeZone: 'Europe/Madrid',
        allDay: false,
      },
      { profileTimeZone: 'America/New_York' },
    );
    expect(span?.start).toBe('2026-10-19');
    expect(event.localStartDay?.toISOString().slice(0, 10)).toBe('2026-10-19');
    expect(event.localEndDay?.toISOString().slice(0, 10)).toBe('2026-10-19');
    expect(reads).toBeGreaterThanOrEqual(3);
  });
});
