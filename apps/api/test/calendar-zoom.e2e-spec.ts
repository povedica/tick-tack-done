import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDailyUseCache } from '../src/auth/api-auth.guard.js';
import { newPersonalAccessToken } from '../src/auth/token-secret.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';

type SuperTestApp = Parameters<typeof request>[0];

loadRootEnv();
process.env.AUTH_MODE = 'dev';
process.env.SCHEDULER_AUTOSTART = 'false';
process.env.BUS_AUTOSTART = 'false';
process.env.REGISTRATION_OPEN = 'true';

const prisma = new PrismaClient();
const DAY = '2026-04-10';
const PAGE_DAY = '2026-08-01';

function cookieHeader(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? '').split(';')[0] ?? '';
}

function queryCount(header: string | undefined): number {
  const match = /desc="(\d+) q"/.exec(header ?? '');
  return Number(match?.[1] ?? '0');
}

function toolText(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('result' in body)) {
    throw new Error('missing tool result');
  }
  const result = body.result;
  if (typeof result !== 'object' || result === null || !('content' in result)) {
    throw new Error('missing tool content');
  }
  const content = result.content;
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error('missing tool content');
  }
  const first: unknown = content[0];
  if (
    typeof first !== 'object' ||
    first === null ||
    !('text' in first) ||
    typeof first.text !== 'string'
  ) {
    throw new Error('missing tool text');
  }
  return first.text;
}

describe('F6 calendar summary and range', () => {
  let app: INestApplication;
  let server: SuperTestApp;
  let cookie: string;
  let userId: string;
  let email: string;
  let listA = '';
  let listB = '';
  let restricted = '';
  let openToken = '';
  const pageIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as SuperTestApp;
    email = `cal-f6-${randomUUID()}@reflexionia.test`;
    const registered = await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password: 'correct-horse', display_name: 'Zoom' })
      .expect(201);
    userId = registered.body.id as string;
    cookie = cookieHeader(registered.headers['set-cookie']);
    await prisma.user.update({ where: { id: userId }, data: { timeZone: 'Europe/Madrid' } });
    const projects = await request(server)
      .get('/api/v1/projects')
      .set('Cookie', cookie)
      .expect(200);
    const inbox = (projects.body.items as { id: string; is_inbox?: boolean }[]).find(
      (item) => item.is_inbox === true,
    );
    if (inbox === undefined) {
      throw new Error('register did not create an inbox');
    }
    listA = inbox.id;
    await prisma.project.update({ where: { id: listA }, data: { color: '#111111' } });
    const other = await prisma.project.create({
      data: { ownerId: userId, name: 'Otra', color: '#222222' },
    });
    listB = other.id;
    const stamp = new Date(`${DAY}T00:00:00.000Z`);
    await prisma.task.createMany({
      data: [
        {
          ownerId: userId,
          projectId: listA,
          createdById: userId,
          title: 'en la lista A',
          startDate: new Date(`${DAY}T08:00:00.000Z`),
          dueDate: new Date(`${DAY}T08:00:00.000Z`),
          timeZone: 'Europe/Madrid',
          localStartDay: stamp,
          localEndDay: stamp,
        },
        {
          ownerId: userId,
          projectId: listB,
          createdById: userId,
          title: 'en la lista B',
          startDate: new Date(`${DAY}T09:00:00.000Z`),
          dueDate: new Date(`${DAY}T09:00:00.000Z`),
          timeZone: 'Europe/Madrid',
          localStartDay: stamp,
          localEndDay: stamp,
        },
      ],
    });
    const visible = await prisma.calendarSubscription.create({
      data: {
        ownerId: userId,
        provider: 'ical',
        color: '#abcdef',
        visible: true,
        summary: 'Visible',
      },
    });
    const hidden = await prisma.calendarSubscription.create({
      data: {
        ownerId: userId,
        provider: 'ical',
        color: '#000000',
        visible: false,
        summary: 'Oculto',
      },
    });
    await prisma.externalEvent.createMany({
      data: [
        {
          ownerId: userId,
          subscriptionId: visible.id,
          externalUid: 'visible-1',
          title: 'Cita visible',
          startsAt: new Date(`${DAY}T10:00:00.000Z`),
          endsAt: new Date(`${DAY}T11:00:00.000Z`),
          timeZone: 'Europe/Madrid',
          localStartDay: stamp,
          localEndDay: stamp,
          location: 'Sala',
          description: 'Notas',
        },
        {
          ownerId: userId,
          subscriptionId: hidden.id,
          externalUid: 'hidden-1',
          title: 'Cita oculta',
          startsAt: new Date(`${DAY}T12:00:00.000Z`),
          endsAt: new Date(`${DAY}T13:00:00.000Z`),
          timeZone: 'Europe/Madrid',
          localStartDay: stamp,
          localEndDay: stamp,
        },
      ],
    });
    const restrictedToken = newPersonalAccessToken();
    restricted = restrictedToken.token;
    await prisma.personalAccessToken.create({
      data: {
        ownerId: userId,
        name: 'una lista',
        tokenHash: restrictedToken.hash,
        tokenPrefix: restrictedToken.prefix,
        scopes: ['calendar:read'],
        listRestricted: true,
        listIds: [listA],
      },
    });
    const open = newPersonalAccessToken();
    openToken = open.token;
    await prisma.personalAccessToken.create({
      data: {
        ownerId: userId,
        name: 'sin recorte',
        tokenHash: open.hash,
        tokenPrefix: open.prefix,
        scopes: ['calendar:read'],
        listRestricted: false,
      },
    });
    const pageDay = new Date(`${PAGE_DAY}T00:00:00.000Z`);
    for (let index = 0; index < 600; index += 1) {
      pageIds.push(randomUUID());
    }
    await prisma.task.createMany({
      data: pageIds.map((id, index) => ({
        id,
        ownerId: userId,
        projectId: listA,
        createdById: userId,
        title: `pagina ${String(index)}`,
        startDate: new Date(Date.UTC(2026, 7, 1, 0, 0, index)),
        dueDate: new Date(Date.UTC(2026, 7, 1, 0, 0, index)),
        timeZone: 'Europe/Madrid',
        localStartDay: pageDay,
        localEndDay: pageDay,
      })),
    });
  });

  afterAll(async () => {
    await app.close();
    await wipe(userId);
    await prisma.$disconnect();
  });

  it('counts both lists for a session and keeps external events for a one-list token', async () => {
    const session = await request(server)
      .get('/api/v1/calendar/summary')
      .query({ from: DAY, to: DAY })
      .set('Cookie', cookie)
      .expect(200);
    expect(session.headers['cache-control']).toBe('private, no-cache');
    expect(session.headers.vary).toBe('Cookie, Authorization');
    expect(session.body.days[DAY].n).toBe(3);
    expect(session.body.days[DAY].c).toEqual(
      expect.arrayContaining(['#111111', '#222222', '#abcdef']),
    );
    expect(session.headers.etag).toMatch(/^W\/"v\d+-/);

    const projects = await request(server)
      .get('/api/v1/projects')
      .set('Cookie', cookie)
      .expect(200);
    expect(projects.headers['cache-control']).toBe('no-store');

    const clipped = await request(server)
      .get('/api/v1/calendar/summary')
      .query({ from: DAY, to: DAY })
      .set('Authorization', `Bearer ${restricted}`)
      .expect(200);
    expect(clipped.body.days[DAY].n).toBe(2);
    expect(clipped.body.days[DAY].c).not.toContain('#222222');
    expect(session.headers.etag).not.toBe(clipped.headers.etag);

    const replay = await request(server)
      .get('/api/v1/calendar/summary')
      .query({ from: DAY, to: DAY })
      .set('Authorization', `Bearer ${restricted}`)
      .set('If-None-Match', String(session.headers.etag))
      .expect(200);
    expect(replay.body.days[DAY].n).toBe(2);

    const openSummary = await request(server)
      .get('/api/v1/calendar/summary')
      .query({ from: DAY, to: DAY })
      .set('Authorization', `Bearer ${openToken}`)
      .expect(200);
    expect(openSummary.body.days[DAY].n).toBe(3);

    const range = await request(server)
      .get('/api/v1/calendar/range')
      .query({ from: DAY, to: DAY, fields: 'compact' })
      .set('Authorization', `Bearer ${restricted}`)
      .expect(200);
    const titles = (range.body.entries as { title: string; content?: string }[]).map(
      (entry) => entry.title,
    );
    expect(titles).toContain('en la lista A');
    expect(titles).toContain('Cita visible');
    expect(titles).not.toContain('en la lista B');
    expect(titles).not.toContain('Cita oculta');
    expect(range.body.entries[0]).not.toHaveProperty('content');
    expect(range.body.next_cursor).toBeNull();
  });

  it('answers 304 from the session etag in at most two queries', async () => {
    resetDailyUseCache();
    const query = { from: DAY, to: DAY };
    await request(server)
      .get('/api/v1/calendar/summary')
      .query(query)
      .set('Cookie', cookie)
      .expect(200);
    const warm = await request(server)
      .get('/api/v1/calendar/summary')
      .query(query)
      .set('Cookie', cookie)
      .expect(200);
    const cached = await request(server)
      .get('/api/v1/calendar/summary')
      .query(query)
      .set('Cookie', cookie)
      .set('If-None-Match', String(warm.headers.etag))
      .expect(304);
    expect(cached.text).toBe('');
    expect(cached.headers.etag).toBe(warm.headers.etag);
    expect(queryCount(String(cached.headers['server-timing']))).toBeLessThanOrEqual(2);
  });

  it('bumps the version when a project color changes and refuses the previous etag', async () => {
    const before = await request(server)
      .get('/api/v1/calendar/summary')
      .query({ from: DAY, to: DAY })
      .set('Cookie', cookie)
      .expect(200);
    await request(server)
      .patch(`/api/v1/projects/${listA}`)
      .set('X-Dev-User-Email', email)
      .send({ color: '#333333' })
      .expect(200);
    const after = await request(server)
      .get('/api/v1/calendar/summary')
      .query({ from: DAY, to: DAY })
      .set('Cookie', cookie)
      .set('If-None-Match', String(before.headers.etag))
      .expect(200);
    expect(BigInt(after.body.version as string)).toBeGreaterThan(
      BigInt(before.body.version as string),
    );
    expect(after.headers.etag).not.toBe(before.headers.etag);
  });

  it('rebuilds a month of more than 500 entries from next_cursor', async () => {
    const seen = new Set<string>();
    let cursor = '';
    let pages = 0;
    while (pages < 5) {
      const response = await request(server)
        .get('/api/v1/calendar/range')
        .query({
          from: PAGE_DAY,
          to: PAGE_DAY,
          limit: '500',
          ...(cursor.length > 0 ? { cursor } : {}),
        })
        .set('Cookie', cookie)
        .expect(200);
      const entries = response.body.entries as { id: string }[];
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(seen.has(entry.id)).toBe(false);
        seen.add(entry.id);
      }
      pages += 1;
      const next = response.body.next_cursor as string | null;
      if (next === null) {
        break;
      }
      cursor = next;
    }
    expect(pages).toBe(2);
    expect([...seen].sort()).toEqual([...pageIds].sort());
  });

  it('keeps two visible calendars in start order on the same day', async () => {
    const day = '2026-05-02';
    const stamp = new Date(`${day}T00:00:00.000Z`);
    const early = await prisma.calendarSubscription.create({
      data: {
        ownerId: userId,
        provider: 'ical',
        color: '#aa0000',
        visible: true,
        summary: 'Temprano',
      },
    });
    const late = await prisma.calendarSubscription.create({
      data: {
        ownerId: userId,
        provider: 'ical',
        color: '#00bb00',
        visible: true,
        summary: 'Tarde',
      },
    });
    await prisma.externalEvent.createMany({
      data: [
        {
          ownerId: userId,
          subscriptionId: late.id,
          externalUid: 'late-cal',
          title: 'Tarde',
          startsAt: new Date(`${day}T15:00:00.000Z`),
          endsAt: new Date(`${day}T16:00:00.000Z`),
          timeZone: 'Europe/Madrid',
          localStartDay: stamp,
          localEndDay: stamp,
        },
        {
          ownerId: userId,
          subscriptionId: early.id,
          externalUid: 'early-cal',
          title: 'Temprano',
          startsAt: new Date(`${day}T08:00:00.000Z`),
          endsAt: new Date(`${day}T09:00:00.000Z`),
          timeZone: 'Europe/Madrid',
          localStartDay: stamp,
          localEndDay: stamp,
        },
      ],
    });
    const summary = await request(server)
      .get('/api/v1/calendar/summary')
      .query({ from: day, to: day })
      .set('Cookie', cookie)
      .expect(200);
    expect(summary.body.days[day].n).toBe(2);
    expect(summary.body.days[day].c).toEqual(['#aa0000', '#00bb00']);
  });

  it('rejects an oversized window and a limit above 500', async () => {
    await request(server)
      .get('/api/v1/calendar/summary')
      .query({ from: '2026-01-01', to: '2027-02-10' })
      .set('Cookie', cookie)
      .expect(400);
    await request(server)
      .get('/api/v1/calendar/range')
      .query({ from: DAY, to: DAY, limit: '501' })
      .set('Cookie', cookie)
      .expect(400);
  });

  it('passes the token list restriction through the read-only MCP tools', async () => {
    const summary = await request(server)
      .post('/api/v1/mcp')
      .set('Authorization', `Bearer ${restricted}`)
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'calendar_summary', arguments: { from: DAY, to: DAY } },
      })
      .expect(200);
    expect(summary.body.result.isError).toBe(false);
    const body = JSON.parse(toolText(summary.body)) as { days: Record<string, { n: number }> };
    expect(body.days[DAY]?.n).toBe(2);
    const listed = await request(server)
      .post('/api/v1/mcp')
      .set('Authorization', `Bearer ${restricted}`)
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
      .expect(200);
    const names = (listed.body.result.tools as { name: string }[]).map((tool) => tool.name);
    expect(names).toContain('calendar_summary');
    expect(names).toContain('calendar_range');
    expect(names).not.toContain('sync_calendar');
  });
});

async function wipe(id: string | undefined): Promise<void> {
  if (id === undefined) {
    return;
  }
  await prisma.activityLog.deleteMany({ where: { OR: [{ ownerId: id }, { actorId: id }] } });
  await prisma.outboxEvent.deleteMany({ where: { ownerId: id } });
  await prisma.session.deleteMany({ where: { userId: id } });
  await prisma.personalAccessToken.deleteMany({ where: { ownerId: id } });
  await prisma.externalEvent.deleteMany({ where: { ownerId: id } });
  await prisma.calendarSubscription.deleteMany({ where: { ownerId: id } });
  await prisma.calendarVersion.deleteMany({ where: { ownerId: id } });
  await prisma.task.deleteMany({ where: { ownerId: id } });
  await prisma.project.deleteMany({ where: { ownerId: id } });
  await prisma.user.delete({ where: { id } });
}
