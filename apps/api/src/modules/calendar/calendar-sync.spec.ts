/* eslint-disable @typescript-eslint/require-await -- the in-memory Prisma double is synchronous */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomainException } from '../../http/domain.exception.js';
import { GoogleSyncService } from './google-sync.service.js';

interface Row {
  id: string;
  ownerId: string;
  provider: string | null;
  calendarId: string | null;
  summary: string | null;
  color: string | null;
  visible: boolean;
  syncDirection: string;
  syncToken: string | null;
  lastSyncedAt: Date | null;
  lastError: string | null;
  syncFailures: number;
  retryAfter: Date | null;
  url: string | null;
  deletedAt: Date | null;
}

interface EventRow {
  id: string;
  ownerId: string;
  subscriptionId: string;
  externalUid: string;
  title: string;
  deletedAt: Date | null;
  status: string;
}

const user = {
  id: 'user-1',
  email: 'ada@example.com',
  timeZone: 'Europe/Madrid',
  completeChildren: 'ask' as const,
  scopes: ['calendar:read', 'calendar:write'],
  tokenId: null,
  sessionId: null,
  listIds: null,
};

function memory() {
  const subs = new Map<string, Row>();
  const events = new Map<string, EventRow>();
  let n = 0;
  const prisma = {
    user: {
      findUnique: vi.fn(async () => ({
        id: user.id,
        email: user.email,
        timeZone: user.timeZone,
        taskCompleteChildren: 'ask',
        googleRefreshToken: 'refresh-token',
        googleGrantedScopes: [
          'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
          'https://www.googleapis.com/auth/calendar.events',
        ],
        googleCalendarEnabled: true,
        googleDriveEnabled: true,
      })),
    },
    calendarSubscription: {
      findMany: vi.fn(async () => [...subs.values()].filter((row) => row.deletedAt === null)),
      findFirst: vi.fn(async ({ where }: { where: Partial<Row> }) => {
        return (
          [...subs.values()].find(
            (row) =>
              (where.id === undefined || row.id === where.id) &&
              (where.ownerId === undefined || row.ownerId === where.ownerId) &&
              (where.provider === undefined || row.provider === where.provider) &&
              (where.calendarId === undefined || row.calendarId === where.calendarId) &&
              (where.syncDirection === undefined || row.syncDirection === where.syncDirection) &&
              row.deletedAt === null,
          ) ?? null
        );
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => subs.get(where.id) ?? null),
      count: vi.fn(async () => [...subs.values()].filter((row) => row.deletedAt === null).length),
      create: vi.fn(async ({ data }: { data: Partial<Row> }) => {
        n += 1;
        const row: Row = {
          id: `sub-${String(n)}`,
          ownerId: user.id,
          provider: 'google',
          calendarId: null,
          summary: null,
          color: null,
          visible: true,
          syncDirection: 'read',
          syncToken: null,
          lastSyncedAt: null,
          lastError: null,
          syncFailures: 0,
          retryAfter: null,
          url: null,
          deletedAt: null,
          ...data,
        };
        subs.set(row.id, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = subs.get(where.id);
        if (row === undefined) {
          throw new Error('missing subscription');
        }
        Object.assign(row, data);
        return row;
      }),
    },
    externalEvent: {
      count: vi.fn(async () => [...events.values()].filter((row) => row.deletedAt === null).length),
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { subscriptionId_externalUid: { subscriptionId: string; externalUid: string } };
        }) => {
          const key = where.subscriptionId_externalUid;
          return (
            [...events.values()].find(
              (row) =>
                row.subscriptionId === key.subscriptionId && row.externalUid === key.externalUid,
            ) ?? null
          );
        },
      ),
      create: vi.fn(async ({ data }: { data: EventRow }) => {
        n += 1;
        const row = { ...data, id: `evt-${String(n)}`, deletedAt: data.deletedAt ?? null };
        events.set(row.id, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<EventRow> }) => {
        const row = events.get(where.id);
        if (row === undefined) {
          throw new Error('missing event');
        }
        Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { subscriptionId: string; externalUid?: string; deletedAt: null };
          data: Partial<EventRow>;
        }) => {
          let count = 0;
          for (const row of events.values()) {
            if (row.subscriptionId !== where.subscriptionId || row.deletedAt !== null) {
              continue;
            }
            if (where.externalUid !== undefined && row.externalUid !== where.externalUid) {
              continue;
            }
            Object.assign(row, data);
            count += 1;
          }
          return { count };
        },
      ),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  return { prisma, subs, events };
}

function serviceOf(prisma: ReturnType<typeof memory>['prisma']) {
  return new GoogleSyncService(prisma as never, { record: vi.fn(async () => undefined) }, {
    lookup: vi.fn(async () => null),
    store: vi.fn(async () => undefined),
  } as never);
}

describe('Google calendar sync', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  it('RF-2510: initial sync follows pages and stores nextSyncToken', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    const { prisma, subs, events } = memory();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('oauth2.googleapis.com/token') && !url.includes('tokeninfo')) {
          return json({ access_token: 'access' });
        }
        if (url.includes('tokeninfo')) {
          return json({ scope: 'openid https://www.googleapis.com/auth/calendar' });
        }
        if (url.includes('calendarList')) {
          return json({
            items: [
              {
                id: 'ada@gmail.com',
                summary: 'Personal',
                primary: true,
                backgroundColor: '#4772FA',
              },
            ],
          });
        }
        if (url.includes('pageToken=p2')) {
          return json({
            items: [timed('b', 'Segundo')],
            nextSyncToken: 'sync-1',
          });
        }
        return json({ items: [timed('a', 'Primero')], nextPageToken: 'p2' });
      }),
    );
    const created = await serviceOf(prisma).subscribe(
      user,
      { calendar_id: 'ada@gmail.com' },
      undefined,
    );
    expect(created.body.imported).toBe(2);
    expect(subs.get(created.body.id)?.syncToken).toBe('sync-1');
    expect(events.size).toBe(2);
  });

  it('RF-2511: incremental applies changes and cancellations', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    const { prisma, events } = memory();
    const row = await prisma.calendarSubscription.create({
      data: { ownerId: user.id, provider: 'google', calendarId: 'ada@gmail.com', syncToken: 'old' },
    });
    await prisma.externalEvent.create({
      data: {
        ownerId: user.id,
        subscriptionId: row.id,
        externalUid: 'gone',
        title: 'Viejo',
        deletedAt: null,
        status: 'confirmed',
      } as EventRow,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('oauth2.googleapis.com/token')) {
          return json({ access_token: 'access' });
        }
        return json({
          items: [timed('fresh', 'Nuevo'), { id: 'gone', status: 'cancelled' }],
          nextSyncToken: 'sync-2',
        });
      }),
    );
    const stats = await serviceOf(prisma).syncOne(user, row.id);
    expect(stats.imported).toBe(1);
    expect(stats.deleted).toBe(1);
    expect(
      [...events.values()].find((event) => event.externalUid === 'gone')?.deletedAt,
    ).toBeInstanceOf(Date);
  });

  it('RF-2512: a 410 clears the sync token and imports again without duplicates', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    const { prisma, subs } = memory();
    const row = await prisma.calendarSubscription.create({
      data: {
        ownerId: user.id,
        provider: 'google',
        calendarId: 'ada@gmail.com',
        syncToken: 'stale',
      },
    });
    await prisma.externalEvent.create({
      data: {
        ownerId: user.id,
        subscriptionId: row.id,
        externalUid: 'a',
        title: 'Viejo',
        deletedAt: null,
        status: 'confirmed',
      } as EventRow,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('oauth2.googleapis.com/token')) {
          return json({ access_token: 'access' });
        }
        if (url.includes('syncToken=')) {
          return new Response('gone', { status: 410 });
        }
        return json({ items: [timed('a', 'Actual')], nextSyncToken: 'sync-3' });
      }),
    );
    const stats = await serviceOf(prisma).syncOne(user, row.id);
    expect(stats.imported + stats.updated).toBe(1);
    expect(subs.get(row.id)?.syncToken).toBe('sync-3');
  });

  it('RF-2502: subscribing twice returns the same calendar', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    const { prisma } = memory();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => page(String(input))),
    );
    const service = serviceOf(prisma);
    const first = await service.subscribe(user, { calendar_id: 'ada@gmail.com' }, undefined);
    const second = await service.subscribe(user, { calendar_id: 'ada@gmail.com' }, undefined);
    expect(second.body.id).toBe(first.body.id);
  });

  it('RF-2516: a token without the calendar scope is rejected', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    const { prisma } = memory();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('tokeninfo')) {
          return json({ scope: 'openid email' });
        }
        if (url.includes('oauth2.googleapis.com/token')) {
          return json({ access_token: 'access' });
        }
        return json({ items: [] });
      }),
    );
    await expect(
      serviceOf(prisma).subscribe(user, { calendar_id: 'ada@gmail.com' }, undefined),
    ).rejects.toBeInstanceOf(DomainException);
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function timed(id: string, summary: string): unknown {
  return {
    id,
    summary,
    status: 'confirmed',
    start: { dateTime: '2026-10-20T09:00:00+02:00', timeZone: 'Europe/Madrid' },
    end: { dateTime: '2026-10-20T10:00:00+02:00', timeZone: 'Europe/Madrid' },
  };
}

async function page(url: string): Promise<Response> {
  if (url.includes('tokeninfo')) {
    return json({ scope: 'https://www.googleapis.com/auth/calendar' });
  }
  if (url.includes('oauth2.googleapis.com/token')) {
    return json({ access_token: 'access' });
  }
  if (url.includes('calendarList')) {
    return json({
      items: [
        { id: 'ada@gmail.com', summary: 'Personal', primary: true, backgroundColor: '#4772FA' },
      ],
    });
  }
  return json({ items: [timed('a', 'Uno')], nextSyncToken: 'sync-1' });
}
