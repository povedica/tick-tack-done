import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';
import { newPersonalAccessToken } from '../src/auth/token-secret.js';
loadRootEnv();
process.env.AUTH_MODE = 'dev';
process.env.SCHEDULER_AUTOSTART = 'false';
process.env.BUS_AUTOSTART = 'false';
const prisma = new PrismaClient();
const query = 'from=2026-10-19&to=2026-10-25&tz=Europe%2FMadrid';
describe('RF-2321–2324 statistics API', () => {
  let app: INestApplication | undefined;
  let server: Parameters<typeof request>[0];
  let owner: string | undefined;
  let other: string;
  let email: string;
  let list: string;
  let tag: string;
  let titled: string;
  let statsToken: string;
  let fullToken: string;
  let blockedToken: string;
  const api = () => ({
    get: (path: string) => request(server).get(`/api/v1/${path}`).set('X-Dev-User-Email', email),
  });
  beforeAll(async () => {
    email = `stats-${randomUUID()}@reflexionia.test`;
    owner = (
      await prisma.user.create({
        data: { email, displayName: 'Statistics test', timeZone: 'Europe/Madrid' },
      })
    ).id;
    other = (
      await prisma.user.create({
        data: { email: `other-${randomUUID()}@reflexionia.test`, displayName: 'Other' },
      })
    ).id;
    list = (await prisma.project.create({ data: { ownerId: owner, name: 'Statistics list' } })).id;
    tag = (await prisma.tag.create({ data: { ownerId: owner, name: 'Statistics tag' } })).id;
    const first = await prisma.task.create({
      data: {
        ownerId: owner,
        createdById: owner,
        projectId: list,
        title: 'Private task title',
        priority: 'high',
        status: 'completed',
        createdAt: new Date('2026-10-01T08:00:00Z'),
        completedAt: new Date('2026-10-19T10:00:00Z'),
        dueDate: new Date('2026-10-19T15:00:00Z'),
        tags: { create: { tagId: tag } },
      },
    });
    titled = first.id;
    await prisma.task.createMany({
      data: [
        {
          ownerId: owner,
          createdById: owner,
          projectId: list,
          title: 'Undated',
          status: 'completed',
          createdAt: new Date('2026-10-01T08:00:00Z'),
          completedAt: new Date('2026-10-19T11:00:00Z'),
        },
        {
          ownerId: owner,
          createdById: owner,
          projectId: list,
          title: 'Assigned to somebody else',
          assigneeId: other,
          dueDate: new Date('2026-01-01T10:00:00Z'),
        },
        {
          ownerId: owner,
          createdById: owner,
          projectId: list,
          title: 'Deleted task',
          deletedAt: new Date(),
          completedAt: new Date('2026-10-19T10:00:00Z'),
        },
      ],
    });
    const completedByOther = await prisma.task.create({
      data: {
        ownerId: owner,
        createdById: owner,
        projectId: list,
        title: 'Other actor',
        status: 'completed',
        createdAt: new Date('2026-10-01T08:00:00Z'),
        completedAt: new Date('2026-10-19T10:00:00Z'),
      },
    });
    await prisma.activityLog.create({
      data: {
        ownerId: owner,
        actorId: other,
        entityType: 'task',
        entityId: completedByOther.id,
        action: 'completed',
      },
    });
    await prisma.focusSession.createMany({
      data: [
        {
          ownerId: owner,
          taskId: titled,
          type: 'focus',
          plannedMinutes: 25,
          actualSeconds: 1500,
          completed: true,
          startedAt: new Date('2026-10-19T10:00:00Z'),
          endedAt: new Date('2026-10-19T10:25:00Z'),
        },
        {
          ownerId: owner,
          type: 'focus',
          plannedMinutes: 25,
          actualSeconds: 60,
          completed: false,
          startedAt: new Date('2026-10-19T12:00:00Z'),
          endedAt: new Date('2026-10-19T12:01:00Z'),
        },
        {
          ownerId: owner,
          type: 'focus',
          plannedMinutes: 25,
          actualSeconds: 600,
          completed: true,
          startedAt: new Date('2026-01-01T10:00:00Z'),
          endedAt: new Date('2026-01-01T10:10:00Z'),
        },
        {
          ownerId: owner,
          type: 'short_break',
          plannedMinutes: 5,
          actualSeconds: 300,
          completed: true,
          startedAt: new Date('2026-10-19T11:00:00Z'),
          endedAt: new Date('2026-10-19T11:05:00Z'),
        },
        {
          ownerId: owner,
          type: 'focus',
          plannedMinutes: 25,
          actualSeconds: 1500,
          completed: true,
          startedAt: new Date(Date.now() + 86400000 * 40),
        },
      ],
    });
    const habit = await prisma.habit.create({
      data: {
        ownerId: owner,
        name: 'Monday only',
        goal: { period: 'day', times_per_period: 1, target_count: 1 },
        frequency: ['monday'],
      },
    });
    await prisma.habitLog.create({
      data: { ownerId: owner, habitId: habit.id, date: new Date('2026-10-19T00:00:00Z'), count: 1 },
    });
    for (const kind of ['stats', 'full', 'blocked']) {
      const issued = newPersonalAccessToken();
      await prisma.personalAccessToken.create({
        data: {
          ownerId: owner,
          name: kind,
          tokenHash: issued.hash,
          tokenPrefix: issued.prefix,
          scopes:
            kind === 'blocked'
              ? ['tasks:read']
              : kind === 'full'
                ? ['stats:read', 'tasks:read']
                : ['stats:read'],
        },
      });
      if (kind === 'stats') statsToken = issued.token;
      else if (kind === 'full') fullToken = issued.token;
      else blockedToken = issued.token;
    }
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });
  afterAll(async () => {
    if (app) await app.close();
    if (owner) {
      await prisma.activityLog.deleteMany({ where: { ownerId: owner } });
      await prisma.focusSession.deleteMany({ where: { ownerId: owner } });
      await prisma.habitLog.deleteMany({ where: { ownerId: owner } });
      await prisma.habit.deleteMany({ where: { ownerId: owner } });
      await prisma.personalAccessToken.deleteMany({ where: { ownerId: owner } });
      await prisma.taskTag.deleteMany({ where: { task: { ownerId: owner } } });
      await prisma.task.deleteMany({ where: { ownerId: owner } });
      await prisma.tag.deleteMany({ where: { ownerId: owner } });
      await prisma.project.deleteMany({ where: { ownerId: owner } });
      await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } });
    }
    await prisma.$disconnect();
  });
  it('RF-2321 D2: overview, series, filters and own activity agree', async () => {
    const response = await api().get(`stats/overview?${query}`).expect(200);
    expect(response.body.summary).toMatchObject({
      completed: 2,
      completion_completed: 1,
      completion_planned: 1,
      completion_rate: 100,
      focus_minutes: 26,
      habit_percent: 100,
    });
    const tasks = await api().get(`stats/tasks?${query}`).expect(200);
    expect(
      tasks.body.completion_series.find((row: { date: string }) => row.date === '2026-10-19').rate,
    ).toBe(100);
    const filtered = await api().get(`stats/focus?${query}&tag=${tag}&priority=high`).expect(200);
    expect(filtered.body.focus_minutes).toBe(25);
    const low = await api().get(`stats/focus?${query}&priority=low`).expect(200);
    expect(low.body.focus_minutes).toBe(0);
  });
  it('RF-2322 / F-05: annual grid covers other periods, excludes future and distributions conserve time', async () => {
    const response = await api().get(`stats/focus?${query}`).expect(200);
    expect(
      response.body.heatmap.find((cell: { date: string }) => cell.date === '2026-01-01').minutes,
    ).toBe(10);
    expect(
      response.body.by_list.reduce((sum: number, row: { value: number }) => sum + row.value, 0),
    ).toBe(26);
    expect(
      response.body.by_task.reduce((sum: number, row: { value: number }) => sum + row.value, 0),
    ).toBe(26);
    const today = new Date().toISOString().slice(0, 10);
    expect(
      response.body.heatmap.filter(
        (cell: { date: string; minutes: number }) => cell.date > today && cell.minutes > 0,
      ),
    ).toEqual([]);
    const annual = await api()
      .get('stats/focus?from=2026-01-01&to=2026-12-31&tz=Europe%2FMadrid')
      .expect(200);
    expect(annual.body.period_timeline).toHaveLength(3);
  });
  it('RF-2322: day selection, breaks and insufficient samples are explicit', async () => {
    const day = await api().get(`stats/focus?${query}&day=2026-01-01`).expect(200);
    expect(day.body.timeline).toHaveLength(1);
    const breaks = await api().get(`stats/focus?${query}&type=short_break`).expect(200);
    expect(breaks.body.focus_minutes).toBe(5);
    expect(breaks.body.pomodoros).toBe(0);
    expect(breaks.body.best_hour).toBeNull();
  });
  it('RF-2323: habits ignore task filters and preserve frequency', async () => {
    const result = await api().get(`stats/habits?${query}&priority=low`).expect(200);
    expect(result.body.habits[0]).toMatchObject({ percent: 100, done: 1, expected: 1 });
    expect(result.body.habits[0].heatmap).toHaveLength(365);
  });
  it('RF-2321 D10: both achievement endpoints use the same public formula and history', async () => {
    const stats = await api().get('stats/achievement').expect(200);
    const me = await api().get('me/achievements').expect(200);
    expect(stats.body).toEqual(me.body);
    expect(stats.body).not.toHaveProperty('levels');
    expect(stats.body.history).toHaveLength(1);
    expect(stats.body.score).toBeGreaterThanOrEqual(0);
    expect(stats.body.score).toBeLessThanOrEqual(100);
    expect(stats.body.components.tasks.max).toBe(50);
    expect(stats.body.components.usage.days).toBe(0);
  });
  it('RF-2324 / §9: aggregates are available without leaking titles through focus or export', async () => {
    const path = `/api/v1/stats/focus?${query}`;
    await request(server).get(path).set('Authorization', `Bearer ${blockedToken}`).expect(403);
    const response = await request(server)
      .get(path)
      .set('Authorization', `Bearer ${statsToken}`)
      .expect(200);
    expect(JSON.stringify(response.body)).not.toContain('Private task title');
    expect(response.body.by_task).toEqual([]);
    const full = await request(server)
      .get(path)
      .set('Authorization', `Bearer ${fullToken}`)
      .expect(200);
    expect(JSON.stringify(full.body)).toContain('Private task title');
    const exported = await request(server)
      .get(`/api/v1/stats/export?${query}&format=json`)
      .set('Authorization', `Bearer ${statsToken}`)
      .expect(200);
    expect(JSON.stringify(exported.body)).not.toContain('Private task title');
    const csv = await api().get(`stats/export?${query}&format=csv`).expect(200);
    expect(csv.text).toContain('TOTAL,2,0,1,1,100,1560,26,1,100');
  });
  it('RF-2321: invalid and overlong ranges fail before reading data', async () => {
    for (const suffix of [
      'from=0001-01-01&to=9999-12-31&tz=UTC',
      'from=2026-02-01&to=2026-02-30&tz=UTC',
      query + '&type=unknown',
      query + '&priority=unknown',
    ])
      await api().get(`stats/focus?${suffix}`).expect(400);
  });
  it('RF-2321 §9: another owner and list-restricted PAT cannot read task or focus aggregates', async () => {
    const issued = newPersonalAccessToken();
    if (owner === undefined) throw new Error('Missing owner');
    await prisma.personalAccessToken.create({
      data: {
        ownerId: owner,
        name: 'restricted',
        tokenHash: issued.hash,
        tokenPrefix: issued.prefix,
        scopes: ['stats:read', 'tasks:read'],
        listRestricted: true,
        listIds: [randomUUID()],
      },
    });
    const response = await request(server)
      .get(`/api/v1/stats/overview?${query}`)
      .set('Authorization', `Bearer ${issued.token}`)
      .expect(200);
    expect(response.body.summary.completed).toBe(0);
    expect(response.body.summary.focus_minutes).toBe(0);
    const otherUser = await prisma.user.findUniqueOrThrow({ where: { id: other } });
    const otherResponse = await request(server)
      .get(`/api/v1/stats/focus?${query}`)
      .set('X-Dev-User-Email', otherUser.email)
      .expect(200);
    expect(otherResponse.body.focus_minutes).toBe(0);
  });
  it('RF-2321: yearly overview responds in under 500 ms for 1000 tasks', async () => {
    if (owner === undefined) throw new Error('Missing fixture owner');
    const fixtureOwner = owner;
    await prisma.task.createMany({
      data: Array.from({ length: 1000 }, (_, index) => ({
        ownerId: fixtureOwner,
        createdById: fixtureOwner,
        projectId: list,
        title: `Performance ${String(index)}`,
        status: 'completed' as const,
        createdAt: new Date(Date.UTC(2026, 4, 1, 8, 0, index)),
        completedAt: new Date(Date.UTC(2026, 4, 2, 10, 0, index)),
        dueDate: new Date('2026-05-02T15:00:00Z'),
      })),
    });
    const start = performance.now();
    const response = await api()
      .get('stats/overview?from=2026-01-01&to=2026-12-31&tz=Europe%2FMadrid')
      .expect(200);
    const elapsed = performance.now() - start;
    expect(response.body.summary.completed).toBe(1002);
    expect(elapsed).toBeLessThan(500);
  });
});
