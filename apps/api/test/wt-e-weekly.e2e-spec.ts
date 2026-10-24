import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
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

it('TTD-AUD-126 RF-2201/2204: new reports persist seven days matching weekly totals with no false trend', async () => {
  const owner = await db.user.create({
    data: {
      email: `wt-e-week-${randomUUID()}@reflexionia.test`,
      displayName: 'Weekly',
      timeZone: 'Europe/Madrid',
    },
  });
  try {
    const project = await db.project.create({ data: { ownerId: owner.id, name: 'Weekly' } });
    await db.task.create({
      data: {
        ownerId: owner.id,
        createdById: owner.id,
        projectId: project.id,
        title: 'Completed now',
        status: 'completed',
        completedAt: new Date(),
      },
    });
    const built = await request(server)
      .post('/api/v1/reports/weekly')
      .set('X-Dev-User-Email', owner.email)
      .expect(200);
    expect(built.body.days).toHaveLength(7);
    expect(
      built.body.days.reduce((sum: number, day: { completed: number }) => sum + day.completed, 0),
    ).toBe(built.body.completed);
    expect(built.body.trend).toBeNull();
    expect(built.body.trend_label).toBeNull();
    const saved = await db.weeklyReport.findFirstOrThrow({ where: { ownerId: owner.id } });
    const payload = saved.payload as { days: unknown[]; trend: null };
    expect(payload.days).toHaveLength(7);
    expect(payload.trend).toBeNull();
  } finally {
    await db.activityLog.deleteMany({ where: { ownerId: owner.id } });
    await db.outboxEvent.deleteMany({ where: { ownerId: owner.id } });
    await db.weeklyReport.deleteMany({ where: { ownerId: owner.id } });
    await db.task.deleteMany({ where: { ownerId: owner.id } });
    await db.project.deleteMany({ where: { ownerId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
  }
});
