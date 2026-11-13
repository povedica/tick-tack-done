/* eslint-disable @typescript-eslint/require-await -- the in-memory Prisma double is synchronous */
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainException } from '../../http/domain.exception.js';
import { CalendarService } from './calendar.service.js';
import { GoogleCalendarNotificationsController } from './calendar.controller.js';
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
  lastReconciledAt: Date | null;
  watchChannelId: string | null;
  watchResourceId: string | null;
  watchTokenHash: string | null;
  watchExpiresAt: Date | null;
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
  startsAt: Date | null;
  deletedAt: Date | null;
  status: string;
}

interface EventWhere {
  subscriptionId?: string;
  externalUid?: string | { startsWith: string };
  deletedAt?: null;
  id?: { in: string[] };
  startsAt?: { gte?: Date; lt?: Date };
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
  const account = { googleStatus: 'connected' };
  let n = 0;
  const prisma = {
    user: {
      findUnique: vi.fn(async () => ({
        id: user.id,
        email: user.email,
        timeZone: user.timeZone,
        taskCompleteChildren: 'ask',
        googleRefreshToken: 'refresh-token',
        googleAccountEmail: 'ada@example.com',
        googleStatus: account.googleStatus,
        googleGrantedScopes: [
          'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
          'https://www.googleapis.com/auth/calendar.events',
        ],
        googleCalendarEnabled: true,
        googleDriveEnabled: true,
      })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    outboxEvent: { create: vi.fn(async () => undefined) },
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
              (where.watchChannelId === undefined || row.watchChannelId === where.watchChannelId) &&
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
          lastReconciledAt: null,
          watchChannelId: null,
          watchResourceId: null,
          watchTokenHash: null,
          watchExpiresAt: null,
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
      findMany: vi.fn(async ({ where }: { where: EventWhere }) => {
        return [...events.values()].filter((row) => eventMatches(row, where));
      }),
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
        const row = {
          ...data,
          id: `evt-${String(n)}`,
          startsAt: data.startsAt ?? null,
          deletedAt: data.deletedAt ?? null,
        };
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
      updateMany: vi.fn(async ({ where, data }: { where: EventWhere; data: Partial<EventRow> }) => {
        let count = 0;
        for (const row of events.values()) {
          if (!eventMatches(row, where)) {
            continue;
          }
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      }),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    $executeRaw: async () => 0,
    $queryRaw: async () => [],
  };
  return { prisma, subs, events, account };
}

function serviceOf(prisma: ReturnType<typeof memory>['prisma']) {
  return new GoogleSyncService(prisma as never, { record: vi.fn(async () => undefined) }, {
    lookup: vi.fn(async () => null),
    store: vi.fn(async () => undefined),
  } as never);
}

function eventMatches(row: EventRow, where: EventWhere): boolean {
  if (where.subscriptionId !== undefined && row.subscriptionId !== where.subscriptionId) {
    return false;
  }
  if (where.deletedAt === null && row.deletedAt !== null) {
    return false;
  }
  if (typeof where.externalUid === 'string' && row.externalUid !== where.externalUid) {
    return false;
  }
  if (
    typeof where.externalUid === 'object' &&
    !row.externalUid.startsWith(where.externalUid.startsWith)
  ) {
    return false;
  }
  if (where.id !== undefined && !where.id.in.includes(row.id)) {
    return false;
  }
  if (where.startsAt !== undefined) {
    if (row.startsAt === null) {
      return false;
    }
    if (where.startsAt.gte !== undefined && row.startsAt.getTime() < where.startsAt.gte.getTime()) {
      return false;
    }
    if (where.startsAt.lt !== undefined && row.startsAt.getTime() >= where.startsAt.lt.getTime()) {
      return false;
    }
  }
  return true;
}

describe('Google calendar sync', () => {
  beforeEach(() => {
    vi.stubEnv('PUBLIC_URL', 'http://127.0.0.1:3000');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

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
    const { prisma, subs, events } = memory();
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
        startsAt: atDays(1),
        deletedAt: null,
        status: 'confirmed',
      } as EventRow,
    });
    await prisma.externalEvent.create({
      data: {
        ownerId: user.id,
        subscriptionId: row.id,
        externalUid: 'clase_20261117T183000Z',
        title: 'Huérfana',
        startsAt: atDays(3),
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
    const live = [...events.values()].filter((event) => event.deletedAt === null);
    expect(live.map((event) => event.externalUid)).toEqual(['a']);
    expect(
      [...events.values()].find((event) => event.externalUid === 'clase_20261117T183000Z')
        ?.deletedAt,
    ).toBeInstanceOf(Date);
    expect(stats.imported + stats.updated).toBeGreaterThan(0);
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

  it('RF-2560: UNTIL on a finished series deletes orphaned instances (Lenguaje musical)', async () => {
    const { prisma, events } = googleEnv();
    const row = await seedSubscription(prisma, { syncToken: 'old', lastReconciledAt: null });
    const orphans = [
      'clase_20261110T183000Z',
      'clase_20261112T183000Z',
      'clase_20261117T183000Z',
      'clase_20261119T183000Z',
    ];
    for (const uid of orphans) {
      await storeEvent(prisma, row.id, uid, atDays(2));
    }
    await storeEvent(prisma, row.id, 'clase_20260901T183000Z', atDays(-40));
    await storeEvent(prisma, row.id, 'clase_20271220T183000Z', atDays(400));
    const other = await seedSubscription(prisma, {
      ownerId: 'user-2',
      calendarId: 'other-calendar',
      syncToken: 'other',
    });
    await storeEvent(prisma, other.id, 'clase_20261110T183000Z', atDays(2), 'user-2');
    stubGoogle(() => ({
      items: [seriesMaster('RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261102T225959Z')],
      nextSyncToken: 'new',
    }));
    const stats = await serviceOf(prisma).syncOne(user, row.id);
    expect(stats.deleted).toBe(4);
    expect(stats.imported).toBe(1);
    for (const uid of orphans) {
      expect(eventOf(events, row.id, uid)?.deletedAt).toBeInstanceOf(Date);
    }
    expect(eventOf(events, row.id, 'clase_20260901T183000Z')?.deletedAt).toBeNull();
    expect(eventOf(events, row.id, 'clase_20271220T183000Z')?.deletedAt).toBeNull();
    expect(eventOf(events, other.id, 'clase_20261110T183000Z')?.deletedAt).toBeNull();
    const saved = await prisma.calendarSubscription.findUnique({ where: { id: row.id } });
    expect(saved?.lastReconciledAt).toBeInstanceOf(Date);
    expect(saved?.syncToken).toBe('new');
  });

  it('RF-2560: a shortened RRULE keeps instances still inside the UNTIL', async () => {
    const { prisma, events } = googleEnv();
    const row = await seedSubscription(prisma, { syncToken: 'old', lastReconciledAt: new Date() });
    const kept = ['clase_20261110T183000Z', 'clase_20261112T183000Z'];
    const dropped = ['clase_20261117T183000Z', 'clase_20261119T183000Z'];
    const keptStarts = new Map<string, Date>();
    for (const uid of kept) {
      const starts = atDays(2);
      keptStarts.set(uid, starts);
      await storeEvent(prisma, row.id, uid, starts);
    }
    for (const uid of dropped) {
      await storeEvent(prisma, row.id, uid, atDays(8));
    }
    await storeEvent(prisma, row.id, 'clase_20260901T183000Z', atDays(-40));
    stubGoogle((url) => {
      if (url.includes('timeMin=')) {
        return { items: kept.map((uid) => confirmed(uid, keptStarts.get(uid) ?? atDays(2))) };
      }
      return {
        items: [seriesMaster('RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261113T225959Z')],
        nextSyncToken: 'short',
      };
    });
    const stats = await serviceOf(prisma).syncOne(user, row.id);
    expect(stats.deleted).toBe(2);
    for (const uid of kept) {
      expect(eventOf(events, row.id, uid)?.deletedAt).toBeNull();
    }
    for (const uid of dropped) {
      expect(eventOf(events, row.id, uid)?.deletedAt).toBeInstanceOf(Date);
    }
    expect(eventOf(events, row.id, 'clase_20260901T183000Z')?.deletedAt).toBeNull();
  });

  it('RF-2562: cancelling a master deletes its instances and not another calendar', async () => {
    const { prisma, events } = googleEnv();
    const row = await seedSubscription(prisma, { syncToken: 'old' });
    await storeEvent(prisma, row.id, 'clase', atDays(-40));
    await storeEvent(prisma, row.id, 'clase_20261110T183000Z', atDays(2));
    await storeEvent(prisma, row.id, 'clase_20261112T183000Z', atDays(400));
    const other = await seedSubscription(prisma, {
      ownerId: 'user-2',
      calendarId: 'other-calendar',
      syncToken: 'other',
    });
    await storeEvent(prisma, other.id, 'clase_20261110T183000Z', atDays(2), 'user-2');
    stubGoogle((url) => {
      if (url.includes('timeMin=')) {
        return { items: [] };
      }
      return { items: [{ id: 'clase', status: 'cancelled' }], nextSyncToken: 'gone' };
    });
    const stats = await serviceOf(prisma).syncOne(user, row.id);
    expect(stats.deleted).toBe(3);
    expect(eventOf(events, row.id, 'clase')?.deletedAt).toBeInstanceOf(Date);
    expect(eventOf(events, row.id, 'clase_20261110T183000Z')?.deletedAt).toBeInstanceOf(Date);
    expect(eventOf(events, row.id, 'clase_20261112T183000Z')?.deletedAt).toBeInstanceOf(Date);
    expect(eventOf(events, other.id, 'clase_20261110T183000Z')?.deletedAt).toBeNull();
  });

  it('RF-2511: a single cancelled instance does not delete its siblings', async () => {
    const { prisma, events } = googleEnv();
    const row = await seedSubscription(prisma, { syncToken: 'old' });
    const siblingStarts = atDays(3);
    await storeEvent(prisma, row.id, 'clase_20261110T183000Z', atDays(1));
    await storeEvent(prisma, row.id, 'clase_20261112T183000Z', siblingStarts);
    stubGoogle((url) => {
      if (url.includes('timeMin=')) {
        return { items: [confirmed('clase_20261112T183000Z', siblingStarts)] };
      }
      return {
        items: [{ id: 'clase_20261110T183000Z', status: 'cancelled' }],
        nextSyncToken: 'next',
      };
    });
    const stats = await serviceOf(prisma).syncOne(user, row.id);
    expect(stats.deleted).toBe(1);
    expect(eventOf(events, row.id, 'clase_20261110T183000Z')?.deletedAt).toBeInstanceOf(Date);
    expect(eventOf(events, row.id, 'clase_20261112T183000Z')?.deletedAt).toBeNull();
  });

  it('RF-2561: incremental sends singleEvents and keeps syncToken across pages', async () => {
    const { prisma } = googleEnv();
    const row = await seedSubscription(prisma, { syncToken: 'old-token' });
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes('oauth2.googleapis.com/token')) {
          return json({ access_token: 'access' });
        }
        if (url.includes('pageToken=')) {
          return json({ items: [], nextSyncToken: 'new-token' });
        }
        if (url.includes('syncToken=')) {
          return json({ items: [timed('a', 'Uno')], nextPageToken: 'p2' });
        }
        return json({ items: [timed('a', 'Uno')] });
      }),
    );
    await serviceOf(prisma).syncOne(user, row.id);
    const incremental = calls.filter(
      (url) => url.includes('/events') && url.includes('syncToken='),
    );
    expect(incremental.length).toBeGreaterThanOrEqual(2);
    const first = incremental[0] ?? '';
    const second = incremental[1] ?? '';
    expect(first).toContain('syncToken=old-token');
    expect(first).toContain('singleEvents=true');
    expect(first).toContain('showDeleted=true');
    expect(first).not.toContain('timeMin');
    expect(first).not.toContain('timeMax');
    expect(second).toContain('syncToken=old-token');
    expect(second).toContain('pageToken=p2');
    expect(second).toContain('singleEvents=true');
    expect(second).not.toContain('timeMin');
  });

  it('RF-2561: a 400 from an incompatible syncToken resyncs like a 410', async () => {
    const { prisma, subs, events } = googleEnv();
    const row = await seedSubscription(prisma, { syncToken: 'stale' });
    await storeEvent(prisma, row.id, 'a', atDays(1));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('oauth2.googleapis.com/token')) {
          return json({ access_token: 'access' });
        }
        if (url.includes('syncToken=')) {
          return new Response('bad token', { status: 400 });
        }
        return json({ items: [timed('a', 'Actual')], nextSyncToken: 'sync-new' });
      }),
    );
    const stats = await serviceOf(prisma).syncOne(user, row.id);
    expect(subs.get(row.id)?.syncToken).toBe('sync-new');
    expect(stats.deleted).toBe(0);
    const live = [...events.values()].filter((event) => event.deletedAt === null);
    expect(live).toHaveLength(1);
    expect(live[0]?.externalUid).toBe('a');
  });

  it('RF-2560: the first sync after deploy reconciles even when the incremental is empty', async () => {
    const { prisma, events } = googleEnv();
    const row = await seedSubscription(prisma, {
      syncToken: 'old',
      lastReconciledAt: null,
      lastSyncedAt: new Date('2026-11-01T00:00:00.000Z'),
    });
    await storeEvent(prisma, row.id, 'clase_20261110T183000Z', atDays(2));
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes('oauth2.googleapis.com/token')) {
          return json({ access_token: 'access' });
        }
        return json({ items: [], nextSyncToken: 'same' });
      }),
    );
    await serviceOf(prisma).syncDue(new Date('2026-11-10T10:00:00.000Z'), false);
    expect(calls.some((url) => url.includes('timeMin='))).toBe(true);
    expect(eventOf(events, row.id, 'clase_20261110T183000Z')?.deletedAt).toBeInstanceOf(Date);
    const saved = await prisma.calendarSubscription.findUnique({ where: { id: row.id } });
    expect(saved?.lastReconciledAt).toBeInstanceOf(Date);
  });

  it('RF-2560: an empty incremental skips the window when reconciliation is recent', async () => {
    const { prisma, events } = googleEnv();
    const reconciled = new Date();
    const row = await seedSubscription(prisma, {
      syncToken: 'old',
      lastReconciledAt: reconciled,
      lastSyncedAt: new Date('2026-11-01T00:00:00.000Z'),
    });
    await storeEvent(prisma, row.id, 'clase_20261110T183000Z', atDays(2));
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes('oauth2.googleapis.com/token')) {
          return json({ access_token: 'access' });
        }
        return json({ items: [], nextSyncToken: 'same' });
      }),
    );
    await serviceOf(prisma).syncDue(new Date('2026-11-10T10:15:00.000Z'), false);
    expect(calls.some((url) => url.includes('timeMin='))).toBe(false);
    expect(eventOf(events, row.id, 'clase_20261110T183000Z')?.deletedAt).toBeNull();
    const saved = await prisma.calendarSubscription.findUnique({ where: { id: row.id } });
    expect(saved?.lastReconciledAt).toBe(reconciled);
  });

  it('RF-2560: a changed incremental reconciles even when the last window was recent', async () => {
    const { prisma, events } = googleEnv();
    const row = await seedSubscription(prisma, {
      syncToken: 'old',
      lastReconciledAt: new Date(),
      lastSyncedAt: new Date('2026-11-01T00:00:00.000Z'),
    });
    await storeEvent(prisma, row.id, 'clase_20261110T183000Z', atDays(2));
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes('oauth2.googleapis.com/token')) {
          return json({ access_token: 'access' });
        }
        if (url.includes('timeMin=')) {
          return json({ items: [] });
        }
        return json({
          items: [seriesMaster('RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261102T225959Z')],
          nextSyncToken: 'new',
        });
      }),
    );
    await serviceOf(prisma).syncDue(new Date('2026-11-10T10:00:00.000Z'), false);
    expect(calls.some((url) => url.includes('timeMin='))).toBe(true);
    expect(eventOf(events, row.id, 'clase_20261110T183000Z')?.deletedAt).toBeInstanceOf(Date);
  });

  it('RF-2565: Google sync runs on a 5 minute mark and skips the minutes between', async () => {
    const { prisma } = googleEnv();
    await seedSubscription(prisma, {
      syncToken: 'old',
      lastSyncedAt: new Date('2026-11-01T00:00:00.000Z'),
      lastReconciledAt: new Date(),
    });
    const fetch = vi.fn(async () =>
      json({ access_token: 'access', items: [], nextSyncToken: 'same' }),
    );
    vi.stubGlobal('fetch', fetch);
    const service = serviceOf(prisma);
    await service.syncDue(new Date('2026-11-10T10:07:00.000Z'), false);
    expect(fetch).not.toHaveBeenCalled();
    await service.syncDue(new Date('2026-11-10T10:05:00.000Z'), false);
    expect(fetch).toHaveBeenCalled();
  });

  it('RF-2563: syncAll keeps google_reconnect_required in the JSON', async () => {
    const { prisma, account } = googleEnv();
    account.googleStatus = 'reauth_required';
    const row = await seedSubscription(prisma, { syncToken: 'old' });
    const result = await serviceOf(prisma).syncAll(user);
    expect(result.google.status).toBe('reauth_required');
    expect(result.subscriptions).toEqual([
      expect.objectContaining({
        id: row.id,
        health: 'reconnect_required',
        error: 'google_reconnect_required',
        last_error: 'google_reconnect_required',
      }),
    ]);
  });

  it('RF-2566: a non-https PUBLIC_URL keeps polling and records calendar_watch_unavailable once', async () => {
    const { prisma } = googleEnv();
    vi.stubEnv('PUBLIC_URL', 'http://todo.example.org');
    const row = await seedSubscription(prisma, {
      syncToken: 'old',
      lastReconciledAt: new Date(),
    });
    const record = vi.fn(
      async (_tx: unknown, _actor: unknown, _event: { readonly type: string }) => undefined,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('oauth2.googleapis.com/token')) {
          return json({ access_token: 'access' });
        }
        return json({ items: [], nextSyncToken: 'next' });
      }),
    );
    const service = new GoogleSyncService(prisma as never, { record }, {
      lookup: vi.fn(async () => null),
      store: vi.fn(async () => undefined),
    } as never);
    await service.syncOne(user, row.id);
    expect(
      (await prisma.calendarSubscription.findUnique({ where: { id: row.id } }))?.lastError,
    ).toBe('calendar_watch_unavailable');
    await service.syncOne(user, row.id);
    const unavailable = record.mock.calls.filter(
      (call) => call[2].type === 'calendar.watch_unavailable@v1',
    );
    expect(unavailable).toHaveLength(1);
    expect(
      (await prisma.calendarSubscription.findUnique({ where: { id: row.id } }))?.syncToken,
    ).toBe('next');
  });

  it('RF-2566: a forged channel token does not sync', async () => {
    const { prisma } = googleEnv();
    const row = await seedSubscription(prisma, {
      watchChannelId: 'channel-1',
      watchResourceId: 'resource-1',
      watchTokenHash: watchHash('good-token'),
      watchExpiresAt: new Date(Date.now() + 60_000),
    });
    const fetch = vi.fn(async () => {
      throw new Error('sync should not start');
    });
    vi.stubGlobal('fetch', fetch);
    const google = serviceOf(prisma);
    const status = await notify(google, {
      'x-goog-channel-id': 'channel-1',
      'x-goog-channel-token': 'forged-token',
      'x-goog-resource-id': 'resource-1',
      'x-goog-resource-state': 'exists',
    });
    expect(status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
    expect(
      (await prisma.calendarSubscription.findUnique({ where: { id: row.id } }))?.syncToken,
    ).toBeNull();
  });

  it('RF-2566: a verified exists notification runs an incremental', async () => {
    const { prisma } = googleEnv();
    await seedSubscription(prisma, {
      syncToken: 'old',
      lastReconciledAt: new Date(),
      lastSyncedAt: new Date(),
      watchChannelId: 'channel-1',
      watchResourceId: 'resource-1',
      watchTokenHash: watchHash('good-token'),
      watchExpiresAt: new Date(Date.now() + 60_000),
    });
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes('oauth2.googleapis.com/token')) {
          return json({ access_token: 'access' });
        }
        return json({ items: [], nextSyncToken: 'next' });
      }),
    );
    const service = serviceOf(prisma);
    const accepted = await service.ingestNotification({
      channelId: 'channel-1',
      token: 'good-token',
      resourceId: 'resource-1',
      state: 'exists',
    });
    expect(accepted).toBe(true);
    await new Promise((resolve) => setImmediate(resolve));
    await service.whenIdle();
    expect(calls.some((url) => url.includes('syncToken=old'))).toBe(true);
  });

  it('RF-2566: removeSubscription stops the watch channel', async () => {
    const { prisma } = googleEnv();
    const row = await seedSubscription(prisma, {
      watchChannelId: 'channel-1',
      watchResourceId: 'resource-1',
      watchTokenHash: watchHash('good-token'),
      watchExpiresAt: new Date(Date.now() + 60_000),
    });
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: { body?: string }) => {
        calls.push({ url: String(input), body: init?.body ?? '' });
        if (String(input).includes('oauth2.googleapis.com/token')) {
          return json({ access_token: 'access' });
        }
        return new Response(null, { status: 204 });
      }),
    );
    const calendars = new CalendarService(
      prisma as never,
      { record: vi.fn(async () => undefined) },
      serviceOf(prisma),
      null,
      {} as never,
    );
    await calendars.removeSubscription(user, row.id);
    expect(
      calls.some((call) => call.url.includes('/channels/stop') && call.body.includes('channel-1')),
    ).toBe(true);
    expect(
      (await prisma.calendarSubscription.findUnique({ where: { id: row.id } }))?.deletedAt,
    ).toBeInstanceOf(Date);
  });

  it('RF-2566: a channel inside 24 hours is replaced and the previous one is stopped', async () => {
    const { prisma } = googleEnv();
    vi.stubEnv('PUBLIC_URL', 'https://todo.example.org');
    const row = await seedSubscription(prisma, {
      watchChannelId: 'old-channel',
      watchResourceId: 'old-resource',
      watchTokenHash: watchHash('old-token'),
      watchExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: { body?: string }) => {
        const url = String(input);
        calls.push({ url, body: init?.body ?? '' });
        if (url.includes('oauth2.googleapis.com/token')) {
          return json({ access_token: 'access' });
        }
        if (url.includes('/events/watch')) {
          return json({
            id: 'new-channel',
            resourceId: 'new-resource',
            expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
          });
        }
        return new Response(null, { status: 204 });
      }),
    );
    await serviceOf(prisma).renewWatches(new Date());
    const saved = await prisma.calendarSubscription.findUnique({ where: { id: row.id } });
    expect(saved?.watchChannelId).toBe('new-channel');
    expect(saved?.watchChannelId).not.toBe('old-channel');
    expect(
      calls.some(
        (call) => call.url.includes('/channels/stop') && call.body.includes('old-channel'),
      ),
    ).toBe(true);
  });
});

async function notify(google: GoogleSyncService, headers: Record<string, string>): Promise<number> {
  const controller = new GoogleCalendarNotificationsController(google);
  let status = 0;
  const response = {
    status(code: number) {
      status = code;
      return this;
    },
    end() {
      return undefined;
    },
  };
  await controller.notify({ header: (name: string) => headers[name] } as never, response as never);
  return status;
}

function watchHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

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

const DAY_MS = 24 * 60 * 60 * 1000;

function atDays(days: number): Date {
  return new Date(Date.now() + days * DAY_MS);
}

function googleEnv(): ReturnType<typeof memory> {
  process.env.GOOGLE_CLIENT_ID = 'client';
  process.env.GOOGLE_CLIENT_SECRET = 'secret';
  return memory();
}

async function seedSubscription(
  prisma: ReturnType<typeof memory>['prisma'],
  data: Partial<Row>,
): Promise<Row> {
  return prisma.calendarSubscription.create({
    data: {
      ownerId: user.id,
      provider: 'google',
      calendarId: 'ada@gmail.com',
      syncDirection: 'read',
      ...data,
    },
  });
}

async function storeEvent(
  prisma: ReturnType<typeof memory>['prisma'],
  subscriptionId: string,
  externalUid: string,
  startsAt: Date,
  ownerId = user.id,
): Promise<void> {
  await prisma.externalEvent.create({
    data: {
      ownerId,
      subscriptionId,
      externalUid,
      title: 'Lenguaje musical',
      startsAt,
      deletedAt: null,
      status: 'confirmed',
    } as EventRow,
  });
}

function eventOf(
  events: Map<string, EventRow>,
  subscriptionId: string,
  externalUid: string,
): EventRow | undefined {
  return [...events.values()].find(
    (event) => event.subscriptionId === subscriptionId && event.externalUid === externalUid,
  );
}

function seriesMaster(rrule: string): unknown {
  return {
    id: 'clase',
    summary: 'Lenguaje musical',
    status: 'confirmed',
    recurrence: [rrule],
    start: { dateTime: '2020-01-07T18:30:00Z', timeZone: 'Europe/Madrid' },
    end: { dateTime: '2020-01-07T19:30:00Z', timeZone: 'Europe/Madrid' },
  };
}

function confirmed(id: string, startsAt: Date): unknown {
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  return {
    id,
    summary: 'Lenguaje musical',
    status: 'confirmed',
    start: { dateTime: startsAt.toISOString(), timeZone: 'Europe/Madrid' },
    end: { dateTime: endsAt.toISOString(), timeZone: 'Europe/Madrid' },
  };
}

function stubGoogle(bodyFor: (url: string) => unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com/token')) {
        return json({ access_token: 'access' });
      }
      return json(bodyFor(url));
    }),
  );
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
