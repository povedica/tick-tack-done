import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';

loadRootEnv();
process.env.AUTH_MODE = 'dev';
const db = new PrismaClient();
let app: INestApplication;
let server: Parameters<typeof request>[0];
beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  configureApp(app);
  await app.init();
  server = app.getHttpServer() as Parameters<typeof request>[0];
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

it('TTD-AUD-10 RF-1204 RF-1205: early finish stores elapsed seconds and matching period totals', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
  const owner = await db.user.create({
    data: {
      email: `focus-period-${randomUUID()}@reflexionia.test`,
      displayName: 'Focus',
      timeZone: 'Europe/Madrid',
    },
  });
  try {
    const started = await request(server)
      .post('/api/v1/focus/sessions')
      .set('X-Dev-User-Email', owner.email)
      .send({ type: 'focus' })
      .expect(201);
    vi.setSystemTime(new Date('2026-10-21T12:01:21Z'));
    const finished = await request(server)
      .post(`/api/v1/focus/sessions/${String(started.body.id)}/finish`)
      .set('X-Dev-User-Email', owner.email)
      .expect(200);
    expect(finished.body).toMatchObject({ actual_seconds: 81, completed: true });
    const lifetime = await request(server)
      .get('/api/v1/focus/stats')
      .set('X-Dev-User-Email', owner.email)
      .expect(200);
    const range = await request(server)
      .get('/api/v1/stats/overview?from=2026-10-21&to=2026-10-21&tz=Europe%2FMadrid')
      .set('X-Dev-User-Email', owner.email)
      .expect(200);
    expect(lifetime.body).toMatchObject({ focus_seconds: 81, completed_pomodoros: 1 });
    expect(range.body.summary.focus_minutes).toBeCloseTo(81 / 60);
    expect(range.body.summary.pomodoros).toBe(1);
  } finally {
    vi.useRealTimers();
    await db.activityLog.deleteMany({ where: { ownerId: owner.id } });
    await db.outboxEvent.deleteMany({ where: { ownerId: owner.id } });
    await db.focusSession.deleteMany({ where: { ownerId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
  }
});

it('TTD-AUD-78 RF-1205: stopwatch and pauses persist; presets leave settings unchanged', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-25T00:50:00Z'));
  const owner = await db.user.create({
    data: {
      email: `focus-pause-${randomUUID()}@reflexionia.test`,
      displayName: 'Focus pause',
      timeZone: 'Europe/Madrid',
    },
  });
  const client = () => request(server);
  const email = owner.email;
  try {
    const started = await client()
      .post('/api/v1/focus/sessions')
      .set('X-Dev-User-Email', email)
      .send({ type: 'stopwatch' })
      .expect(201);
    expect(started.body).toMatchObject({ planned_minutes: 0, remaining_seconds: null });
    const id = String(started.body.id);
    vi.setSystemTime(new Date('2026-10-25T01:00:00Z'));
    await client()
      .post(`/api/v1/focus/sessions/${id}/pause`)
      .set('X-Dev-User-Email', email)
      .expect(200);
    await client()
      .post(`/api/v1/focus/sessions/${id}/pause`)
      .set('X-Dev-User-Email', email)
      .expect(409);
    vi.setSystemTime(new Date('2026-10-25T01:10:00Z'));
    const list = await client()
      .get('/api/v1/focus/sessions?status=active')
      .set('X-Dev-User-Email', email)
      .expect(200);
    expect(list.body.items[0]).toMatchObject({
      elapsed_seconds: 600,
      paused_at: '2026-10-25T01:00:00.000Z',
    });
    await client()
      .post(`/api/v1/focus/sessions/${id}/resume`)
      .set('X-Dev-User-Email', email)
      .expect(200);
    vi.setSystemTime(new Date('2026-10-25T01:20:00Z'));
    const finished = await client()
      .post(`/api/v1/focus/sessions/${id}/finish`)
      .set('X-Dev-User-Email', email)
      .expect(200);
    expect(finished.body.actual_seconds).toBe(1200);
    await client()
      .post(`/api/v1/focus/sessions/${id}/resume`)
      .set('X-Dev-User-Email', email)
      .expect(409);
    const preset = await client()
      .post('/api/v1/focus/sessions')
      .set('X-Dev-User-Email', email)
      .send({ planned_minutes: 15 })
      .expect(201);
    expect(preset.body.planned_minutes).toBe(15);
    const settings = await client()
      .get('/api/v1/focus/settings')
      .set('X-Dev-User-Email', email)
      .expect(200);
    expect(settings.body.pomodoroMinutes).toBe(25);
    await client()
      .post('/api/v1/focus/sessions')
      .set('X-Dev-User-Email', email)
      .send({ planned_minutes: 181 })
      .expect(400);
  } finally {
    vi.useRealTimers();
    await db.activityLog.deleteMany({ where: { ownerId: owner.id } });
    await db.outboxEvent.deleteMany({ where: { ownerId: owner.id } });
    await db.focusSession.deleteMany({ where: { ownerId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
  }
});

it('TTD-AUD-59: view preferences persist across clients and stay owner-scoped', async () => {
  const owners = await Promise.all(
    ['one', 'two'].map((name) =>
      db.user.create({
        data: { email: `prefs-${name}-${randomUUID()}@reflexionia.test`, displayName: name },
      }),
    ),
  );
  const [first, second] = owners;
  if (!first || !second) throw new Error('Missing test owners');
  const preferences = {
    view: 'kanban',
    group: 'priority',
    sort: 'title',
    order: 'asc',
    showDetails: true,
    hideCompleted: true,
    detailLayout: 'side',
    syncAcrossDevices: true,
  };
  try {
    await request(server)
      .put('/api/v1/me/view-preferences/smart%3Atoday')
      .set('X-Dev-User-Email', first.email)
      .send(preferences)
      .expect(200);
    const read = await request(server)
      .get('/api/v1/me/view-preferences/smart%3Atoday')
      .set('X-Dev-User-Email', first.email)
      .expect(200);
    expect(read.body.preferences).toEqual(preferences);
    const other = await request(server)
      .get('/api/v1/me/view-preferences/smart%3Atoday')
      .set('X-Dev-User-Email', second.email)
      .expect(200);
    expect(other.body.preferences).toBeNull();
    await request(server)
      .put('/api/v1/me/view-preferences/smart%3Atoday')
      .set('X-Dev-User-Email', first.email)
      .send({ ...preferences, view: 'unknown' })
      .expect(400);
  } finally {
    for (const owner of owners) {
      await db.activityLog.deleteMany({ where: { ownerId: owner.id } });
      await db.outboxEvent.deleteMany({ where: { ownerId: owner.id } });
      await db.user.delete({ where: { id: owner.id } });
    }
  }
});
