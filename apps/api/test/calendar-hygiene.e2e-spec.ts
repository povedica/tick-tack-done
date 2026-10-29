import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDailyUseCache } from '../src/auth/api-auth.guard.js';
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

function cookieHeader(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? '').split(';')[0] ?? '';
}

function queryCount(header: string | undefined): number {
  const match = /desc="(\d+) q"/.exec(header ?? '');
  return Number(match?.[1] ?? '0');
}

describe('F2 calendar hygiene', () => {
  let app: INestApplication;
  let server: SuperTestApp;
  let cookie: string;
  let userId: string;
  let otherId: string | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as SuperTestApp;
    const email = `cal-f2-${randomUUID()}@reflexionia.test`;
    const registered = await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password: 'correct-horse', display_name: 'Calendario' })
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
    await prisma.task.create({
      data: {
        ownerId: userId,
        projectId: inbox.id,
        createdById: userId,
        title: 'spans june',
        startDate: new Date('2026-05-01T10:00:00.000Z'),
        dueDate: new Date('2026-07-01T10:00:00.000Z'),
        timeZone: 'Europe/Madrid',
      },
    });
    const other = await prisma.user.create({
      data: {
        email: `cal-f2-other-${randomUUID()}@reflexionia.test`,
        displayName: 'Otro',
        timeZone: 'Europe/Madrid',
      },
    });
    otherId = other.id;
    const foreign = await prisma.project.create({
      data: { ownerId: other.id, name: 'Ajena', isInbox: true },
    });
    await prisma.task.create({
      data: {
        ownerId: other.id,
        projectId: foreign.id,
        createdById: other.id,
        title: 'lista ajena',
        dueDate: new Date('2026-06-01T12:00:00.000Z'),
        timeZone: 'Europe/Madrid',
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await wipe(userId);
    await wipe(otherId);
    await prisma.$disconnect();
  });

  it('returns an overlapping task, honors include, and hides another owner', async () => {
    const all = await request(server)
      .get('/api/v1/calendar/events')
      .query({ from: '2026-06-01T00:00:00.000Z', to: '2026-06-02T00:00:00.000Z', include: 'all' })
      .set('Cookie', cookie)
      .expect(200);
    const titles = (all.body.tasks as { title: string }[]).map((task) => task.title);
    expect(titles).toContain('spans june');
    expect(titles).not.toContain('lista ajena');

    const external = await request(server)
      .get('/api/v1/calendar/events')
      .query({
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-02T00:00:00.000Z',
        include: 'external',
      })
      .set('Cookie', cookie)
      .expect(200);
    expect(external.body.tasks).toEqual([]);

    const tasksOnly = await request(server)
      .get('/api/v1/calendar/events')
      .query({ from: '2026-06-01T00:00:00.000Z', to: '2026-06-02T00:00:00.000Z', include: 'tasks' })
      .set('Cookie', cookie)
      .expect(200);
    expect(tasksOnly.body.external).toEqual([]);
    expect((tasksOnly.body.tasks as { title: string }[]).map((task) => task.title)).toContain(
      'spans june',
    );
  });

  it('lists the year in at most 5 queries and inserts daily_use once', async () => {
    const email = `cal-f2-budget-${randomUUID()}@reflexionia.test`;
    const registered = await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password: 'correct-horse', display_name: 'Presupuesto' })
      .expect(201);
    const budgetUser = registered.body.id as string;
    const budgetCookie = cookieHeader(registered.headers['set-cookie']);
    const inbox = await prisma.project.findFirst({
      where: { ownerId: budgetUser, isInbox: true },
      select: { id: true },
    });
    if (inbox === null) {
      throw new Error('register did not create an inbox');
    }
    await prisma.task.create({
      data: {
        ownerId: budgetUser,
        projectId: inbox.id,
        createdById: budgetUser,
        title: 'en el año',
        dueDate: new Date('2026-03-02T10:00:00.000Z'),
        timeZone: 'Europe/Madrid',
      },
    });
    resetDailyUseCache();
    const daily = () =>
      prisma.activityLog.count({ where: { ownerId: budgetUser, entityType: 'daily_use' } });
    const before = await daily();
    const query = {
      status: 'active',
      from: '2026-01-01',
      to: '2027-01-01',
      range_field: 'any',
      context: 'auto',
      limit: '100',
    };
    const first = await request(server)
      .get('/api/v1/tasks')
      .query(query)
      .set('Cookie', budgetCookie)
      .expect(200);
    expect((first.body.items as { title: string }[]).map((task) => task.title)).toContain(
      'en el año',
    );
    const afterFirst = await daily();
    expect(afterFirst).toBe(before + 1);
    const second = await request(server)
      .get('/api/v1/tasks')
      .query(query)
      .set('Cookie', budgetCookie)
      .expect(200);
    expect(await daily()).toBe(afterFirst);
    expect(queryCount(String(second.headers['server-timing']))).toBeLessThanOrEqual(5);
    expect(queryCount(String(first.headers['server-timing']))).toBeLessThanOrEqual(5);
    await wipe(budgetUser);
  });
});

async function wipe(id: string | undefined): Promise<void> {
  if (id === undefined) {
    return;
  }
  await prisma.activityLog.deleteMany({ where: { OR: [{ ownerId: id }, { actorId: id }] } });
  await prisma.outboxEvent.deleteMany({ where: { ownerId: id } });
  await prisma.session.deleteMany({ where: { userId: id } });
  await prisma.checklistItem.deleteMany({ where: { ownerId: id } });
  await prisma.taskTag.deleteMany({ where: { task: { ownerId: id } } });
  await prisma.task.deleteMany({ where: { ownerId: id } });
  await prisma.project.deleteMany({ where: { ownerId: id } });
  await prisma.user.delete({ where: { id } });
}
