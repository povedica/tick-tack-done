import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';
loadRootEnv();
process.env.AUTH_MODE = 'dev';
process.env.SCHEDULER_AUTOSTART = 'false';
process.env.BUS_AUTOSTART = 'false';
const prisma = new PrismaClient();
describe('RF-2201 / RF-2204 / RF-2302: weekly balance and safe review', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let owner: string;
  let project: string;
  let email: string;
  let repeat: string;
  beforeAll(async () => {
    email = `weekly-${randomUUID()}@reflexionia.test`;
    owner = (
      await prisma.user.create({
        data: { email, displayName: 'Weekly test', timeZone: 'Europe/Madrid' },
      })
    ).id;
    project = (await prisma.project.create({ data: { ownerId: owner, name: 'Weekly list' } })).id;
    repeat = (
      await prisma.task.create({
        data: {
          ownerId: owner,
          createdById: owner,
          projectId: project,
          title: 'Repeating',
          repeatRule: 'FREQ=DAILY',
          dueDate: new Date('2020-01-01T00:00:00Z'),
        },
      })
    ).id;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });
  afterAll(async () => {
    await app.close();
    if (owner) {
      await prisma.activityLog.deleteMany({ where: { ownerId: owner } });
      await prisma.outboxEvent.deleteMany({ where: { ownerId: owner } });
      await prisma.weeklyReport.deleteMany({ where: { ownerId: owner } });
      await prisma.task.deleteMany({ where: { ownerId: owner } });
      await prisma.project.deleteMany({ where: { ownerId: owner } });
      await prisma.user.deleteMany({ where: { id: owner } });
    }
    await prisma.$disconnect();
  });
  const get = (path: string) =>
    request(server).get(`/api/v1/${path}`).set('X-Dev-User-Email', email);
  it('RF-2201: new totals equal daily sums, focus distinguishes missing sessions and no judgment is generated', async () => {
    const response = await request(server)
      .post('/api/v1/reports/weekly')
      .set('X-Dev-User-Email', email)
      .expect(200);
    const body = response.body as {
      days: { completed: number; created: number }[];
      completed: number;
      created: number;
      focus_minutes: number | null;
      summary: string;
      trend: number | null;
    };
    expect(body.completed).toBe(body.days.reduce((sum, day) => sum + day.completed, 0));
    expect(body.created).toBe(body.days.reduce((sum, day) => sum + day.created, 0));
    expect(body.focus_minutes).toBeNull();
    expect(body.summary).not.toMatch(/floja|buena/);
    expect(body.trend).toBeNull();
  });
  it('RF-2204: GET keeps legacy historical payload unchanged even after current tasks change', async () => {
    const payload = {
      completed: 211,
      created: 303,
      focus_minutes: 0.2,
      habits_expected: 0,
      days: [{ date: '2020-01-06', completed: 1, created: 0 }],
    };
    await prisma.weeklyReport.create({
      data: {
        ownerId: owner,
        weekStart: new Date('2020-01-06T00:00:00Z'),
        tone: 'neutro',
        payload,
      },
    });
    const before = await get('reports/weekly/2020-01-06').expect(200);
    await prisma.task.update({ where: { id: repeat }, data: { title: 'Changed current task' } });
    const after = await get('reports/weekly/2020-01-06').expect(200);
    expect(before.body.payload).toEqual(payload);
    expect(after.body.payload).toEqual(payload);
    const saved = await prisma.weeklyReport.findFirst({
      where: { ownerId: owner, weekStart: new Date('2020-01-06T00:00:00Z') },
    });
    expect(saved?.payload).toEqual(payload);
  });
  it('RF-2302: review exposes recurrence protection and list/date context without changing the task', async () => {
    const response = await get('review/weekly').expect(200);
    expect(response.body.tasks).toContainEqual(
      expect.objectContaining({
        id: repeat,
        recurring: true,
        listName: 'Weekly list',
        dueDate: '2020-01-01T00:00:00.000Z',
      }),
    );
    expect((await prisma.task.findUnique({ where: { id: repeat } }))?.status).toBe('active');
  });
});
