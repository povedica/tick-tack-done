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

it('TTD-AUD-09 RF-2102: dashboard and statistics share the local calendar week', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-18T12:30:00Z'));
  const owner = await db.user.create({
    data: {
      email: `dashboard-week-${randomUUID()}@reflexionia.test`,
      displayName: 'Week',
      timeZone: 'Pacific/Kiritimati',
    },
  });
  try {
    const project = await db.project.create({
      data: { ownerId: owner.id, name: 'Inbox', isInbox: true },
    });
    for (const sample of [
      { at: '2026-10-18T11:00:00Z', status: 'completed' as const },
      { at: '2026-10-18T09:00:00Z', status: 'completed' as const },
      { at: '2026-10-18T11:10:00Z', status: 'cancelled' as const },
    ])
      await db.task.create({
        data: {
          ownerId: owner.id,
          createdById: owner.id,
          projectId: project.id,
          title: 'Week activity',
          status: sample.status,
          createdAt: new Date(sample.at),
          completedAt: new Date(sample.at),
        },
      });
    const dashboard = await request(server)
      .get('/api/v1/dashboard/data')
      .set('X-Dev-User-Email', owner.email)
      .expect(200);
    const statistics = await request(server)
      .get('/api/v1/stats/overview?from=2026-10-19&to=2026-10-25&tz=Pacific%2FKiritimati')
      .set('X-Dev-User-Email', owner.email)
      .expect(200);
    expect(statistics.body.summary.completed).toBe(1);
    expect(dashboard.body.widgets.completed_week.value).toBe(statistics.body.summary.completed);
    expect(dashboard.body.period).toMatchObject({
      from: '2026-10-18T10:00:00.000Z',
      time_zone: 'Pacific/Kiritimati',
    });
  } finally {
    vi.useRealTimers();
    await db.task.deleteMany({ where: { ownerId: owner.id } });
    await db.project.deleteMany({ where: { ownerId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
  }
});
