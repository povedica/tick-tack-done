import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';
import { SchedulerService } from '../src/scheduler/scheduler.service.js';

type SuperTestApp = Parameters<typeof request>[0];

loadRootEnv();
process.env.AUTH_MODE = 'dev';

const prisma = new PrismaClient();

interface Owner {
  id: string;
  email: string;
}

async function createOwner(name: string): Promise<Owner> {
  const email = `${name}-${randomUUID()}@reflexionia.test`;
  const user = await prisma.user.create({
    data: { email, displayName: name, timeZone: 'Europe/Madrid' },
  });
  return { id: user.id, email };
}

async function removeOwner(id: string): Promise<void> {
  await prisma.reminderDelivery.deleteMany({ where: { ownerId: id } });
  await prisma.habitLog.deleteMany({ where: { ownerId: id } });
  await prisma.habit.deleteMany({ where: { ownerId: id } });
  await prisma.idempotencyRecord.deleteMany({ where: { ownerId: id } });
  await prisma.outboxEvent.deleteMany({ where: { ownerId: id } });
  await prisma.activityLog.deleteMany({ where: { ownerId: id } });
  await prisma.user.delete({ where: { id } });
}

function shiftDate(date: string, days: number): string {
  const utc = new Date(`${date}T00:00:00.000Z`);
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

describe('habits API', () => {
  let app: INestApplication;
  let server: SuperTestApp;
  let owner: Owner;
  let other: Owner;

  beforeAll(async () => {
    await prisma.$connect();
    owner = await createOwner('habits');
    other = await createOwner('habits-other');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as SuperTestApp;
  });

  afterAll(async () => {
    await app.close();
    await removeOwner(owner.id);
    await removeOwner(other.id);
    await prisma.$disconnect();
  });

  function authed(email: string) {
    const header = { 'X-Dev-User-Email': email };
    return {
      get: (url: string) => request(server).get(url).set(header),
      post: (url: string) => request(server).post(url).set(header),
      patch: (url: string) => request(server).patch(url).set(header),
      delete: (url: string) => request(server).delete(url).set(header),
    };
  }

  it('RF-1301 RF-1304: creates, lists, updates and deletes a habit without creating a task', async () => {
    const api = authed(owner.email);
    const tasksBefore = await prisma.task.count({ where: { ownerId: owner.id } });
    const created = await api
      .post('/api/v1/habits')
      .send({
        name: '  Beber agua  ',
        icon: 'droplet',
        color: '#38bdf8',
        goal: { times_per_period: 8, period: 'day', target_count: 8 },
        frequency: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        reminder_time: '09:00',
        motivation_note: 'Ocho vasos',
      })
      .expect(201);
    expect(created.body.name).toBe('Beber agua');
    expect(created.body.goal).toEqual({ times_per_period: 8, period: 'day', target_count: 8 });
    expect(created.body.reminder_time).toBe('09:00');
    expect(created.body.today.count).toBe(0);
    expect(created.body.today.met).toBe(false);

    const listed = await api.get('/api/v1/habits').expect(200);
    expect(listed.body.items.some((item: { id: string }) => item.id === created.body.id)).toBe(
      true,
    );
    await api.get(`/api/v1/habits/${created.body.id}`).expect(200);
    await authed(other.email).get(`/api/v1/habits/${created.body.id}`).expect(404);

    const updated = await api
      .patch(`/api/v1/habits/${created.body.id}`)
      .send({ archived: true, color: '#0ea5e9' })
      .expect(200);
    expect(updated.body.archived).toBe(true);
    expect(updated.body.color).toBe('#0ea5e9');

    await api
      .post('/api/v1/habits')
      .send({
        name: 'Mal',
        goal: { times_per_period: 4, period: 'week', target_count: 1 },
        frequency: ['monday'],
      })
      .expect(400);

    await api.delete(`/api/v1/habits/${created.body.id}`).expect(204);
    await api.get(`/api/v1/habits/${created.body.id}`).expect(404);
    expect(await prisma.task.count({ where: { ownerId: owner.id } })).toBe(tasksBefore);

    const events = await prisma.outboxEvent.findMany({
      where: {
        ownerId: owner.id,
        type: { in: ['habit.created@v1', 'habit.updated@v1', 'habit.deleted@v1'] },
      },
    });
    expect(events.map((event) => event.type).sort()).toEqual([
      'habit.created@v1',
      'habit.deleted@v1',
      'habit.updated@v1',
    ]);
  });

  it('RF-1302 RF-1303 RF-1305: checks in with a counter, reports stats and emits goal events', async () => {
    const api = authed(owner.email);
    const created = await api
      .post('/api/v1/habits')
      .send({
        name: 'Caminar',
        goal: { times_per_period: 1, period: 'day', target_count: 1 },
        frequency: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        reminder_time: '09:00',
      })
      .expect(201);
    const today = created.body.today.date as string;
    const key = randomUUID();
    const first = await api
      .post(`/api/v1/habits/${created.body.id}/checkins`)
      .set('Idempotency-Key', key)
      .send({ date: today, count: 1, note: 'Vuelta al parque' })
      .expect(200);
    expect(first.body).toMatchObject({
      count: 1,
      note: 'Vuelta al parque',
      goal_met: true,
      streak_broken: false,
    });
    const replay = await api
      .post(`/api/v1/habits/${created.body.id}/checkins`)
      .set('Idempotency-Key', key)
      .send({ date: today, count: 1, note: 'Vuelta al parque' })
      .expect(200);
    expect(replay.body.id).toBe(first.body.id);
    expect(await prisma.habitLog.count({ where: { habitId: created.body.id } })).toBe(1);

    await api
      .post(`/api/v1/habits/${created.body.id}/checkins`)
      .send({ date: '2026-02-31', count: 1 })
      .expect(400);
    await api
      .post(`/api/v1/habits/${created.body.id}/checkins`)
      .send({ date: shiftDate(today, 1), count: 1 })
      .expect(400);

    const mondayOnly = await api
      .post('/api/v1/habits')
      .send({
        name: 'Lunes',
        goal: { times_per_period: 1, period: 'day', target_count: 1 },
        frequency: ['monday'],
      })
      .expect(201);
    if (mondayOnly.body.today.date !== today) {
      throw new Error('today drifted during the test');
    }
    const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    if (weekday !== 1) {
      await api
        .post(`/api/v1/habits/${mondayOnly.body.id}/checkins`)
        .send({ date: today, count: 1 })
        .expect(400);
    }

    await api
      .post(`/api/v1/habits/${created.body.id}/checkins`)
      .send({ date: shiftDate(today, -2), count: 1 })
      .expect(200);

    const stats = await api.get(`/api/v1/habits/${created.body.id}/stats?year=2026`).expect(200);
    expect(stats.body.streak_current).toBeGreaterThanOrEqual(1);
    expect(stats.body.streak_best).toBeGreaterThanOrEqual(1);
    expect(stats.body.heatmap).toHaveLength(365);
    expect(stats.body.completion_percent.week).toBeGreaterThan(0);
    const todayCell = stats.body.aggregate_heatmap.find(
      (cell: { date: string }) => cell.date === today,
    );
    expect(todayCell.scheduled).toBeGreaterThanOrEqual(1);
    expect(todayCell.met).toBeGreaterThanOrEqual(1);

    const types = await prisma.outboxEvent.findMany({
      where: {
        ownerId: owner.id,
        data: { path: ['habit_id'], equals: created.body.id },
      },
      select: { type: true },
    });
    expect(types.map((event) => event.type)).toContain('habit.checkin@v1');
    expect(types.map((event) => event.type)).toContain('habit.goal_met@v1');

    const cleared = await api
      .post(`/api/v1/habits/${created.body.id}/checkins`)
      .send({ date: today, count: 0 })
      .expect(200);
    expect(cleared.body.streak_broken).toBe(true);
  });

  it('RF-1301–1303: challenge and dated settings preserve counts and notes on past days', async () => {
    const api = authed(owner.email);
    const created = await api
      .post('/api/v1/habits')
      .send({
        name: 'Reto sintético',
        challenge_days: 100,
        goal: { period: 'day', times_per_period: 1, target_count: 1 },
        frequency: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      })
      .expect(201);
    const id = created.body.id as string;
    const yesterday = shiftDate(String(created.body.today.date), -1);
    await api
      .post(`/api/v1/habits/${id}/checkins`)
      .send({ date: yesterday, count: 1, note: 'Nota conservada' })
      .expect(200);
    await api
      .patch(`/api/v1/habits/${id}`)
      .send({
        goal: { period: 'day', times_per_period: 8, target_count: 8 },
        frequency: ['monday'],
      })
      .expect(200);
    const stats = await api.get(`/api/v1/habits/${id}/stats`).expect(200);
    expect(stats.body.logs).toContainEqual({ date: yesterday, count: 1, note: 'Nota conservada' });
    expect(
      stats.body.heatmap.find((cell: { date: string }) => cell.date === yesterday),
    ).toMatchObject({ scheduled: true, met: true });
    expect(stats.body.completed_days).toBe(1);
    await api
      .post(`/api/v1/habits/${id}/checkins`)
      .send({ date: yesterday, count: 2, note: 'Corregida' })
      .expect(200);
    const current = await api.get(`/api/v1/habits/${id}`).expect(200);
    expect(current.body.challenge_days).toBe(100);
    await api.patch(`/api/v1/habits/${id}`).send({ archived: true }).expect(200);
    await api.patch(`/api/v1/habits/${id}`).send({ archived: false }).expect(200);
    const restored = await api.get(`/api/v1/habits/${id}/stats`).expect(200);
    expect(restored.body.logs).toContainEqual({ date: yesterday, count: 2, note: 'Corregida' });
  });

  it('RF-1301 RF-1305: the scheduler queues the daily reminder and records one broken streak', async () => {
    const api = authed(owner.email);
    const created = await api
      .post('/api/v1/habits')
      .send({
        name: 'Leer',
        goal: { times_per_period: 1, period: 'day', target_count: 1 },
        frequency: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        reminder_time: '09:00',
      })
      .expect(201);
    const today = created.body.today.date as string;
    await api
      .post(`/api/v1/habits/${created.body.id}/checkins`)
      .send({ date: shiftDate(today, -2), count: 1 })
      .expect(200);

    const scheduler = app.get(SchedulerService);
    await scheduler.run(new Date(), false);

    const delivery = await prisma.reminderDelivery.findFirst({
      where: { ownerId: owner.id, dedupeKey: { startsWith: `habit:${created.body.id}:` } },
    });
    expect(delivery).not.toBeNull();

    const breaks = await prisma.outboxEvent.findMany({
      where: {
        ownerId: owner.id,
        type: 'habit.streak_broken@v1',
        data: { path: ['habit_id'], equals: created.body.id },
      },
    });
    expect(breaks.length).toBeGreaterThanOrEqual(1);
    await scheduler.run(new Date(), false);
    const again = await prisma.outboxEvent.count({
      where: {
        ownerId: owner.id,
        type: 'habit.streak_broken@v1',
        data: { path: ['habit_id'], equals: created.body.id },
      },
    });
    expect(again).toBe(breaks.length);
  });
});
