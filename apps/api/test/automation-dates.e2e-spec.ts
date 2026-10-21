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

it('TTD-AUD-01 RF-904: automation conditions use task start before deadline', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
  const owner = await db.user.create({
    data: { email: `automation-dates-${randomUUID()}@reflexionia.test`, displayName: 'Dates' },
  });
  try {
    const project = await db.project.create({
      data: { ownerId: owner.id, name: 'Inbox', isInbox: true },
    });
    const task = await db.task.create({
      data: {
        ownerId: owner.id,
        createdById: owner.id,
        projectId: project.id,
        title: 'Start tomorrow',
        startDate: new Date('2026-10-22T09:00:00Z'),
        dueDate: null,
      },
    });
    for (const scenario of [
      { op: 'tomorrow', expected: 1 },
      { op: 'no_date', expected: 0 },
    ]) {
      const rule = await db.automation.create({
        data: {
          ownerId: owner.id,
          name: scenario.op,
          trigger: { cron: '0 12 * * *' },
          conditions: {
            version: 1,
            combinator: 'AND',
            groups: [{ combinator: 'AND', conditions: [{ field: 'date', op: scenario.op }] }],
          },
          actions: [],
        },
      });
      await request(server)
        .post(`/api/v1/automations/${rule.id}/run`)
        .set('X-Dev-User-Email', owner.email)
        .expect(204);
      expect(await db.automationRun.count({ where: { automationId: rule.id } })).toBe(
        scenario.expected,
      );
    }
    await db.task.update({
      where: { id: task.id },
      data: { dueDate: new Date('2026-10-21T09:00:00Z') },
    });
    const rule = await db.automation.findFirstOrThrow({
      where: { ownerId: owner.id, name: 'tomorrow' },
    });
    await request(server)
      .post(`/api/v1/automations/${rule.id}/run`)
      .set('X-Dev-User-Email', owner.email)
      .expect(204);
    expect(await db.automationRun.count({ where: { automationId: rule.id } })).toBe(2);
  } finally {
    vi.useRealTimers();
    await db.automationRun.deleteMany({ where: { automation: { ownerId: owner.id } } });
    await db.automation.deleteMany({ where: { ownerId: owner.id } });
    await db.activityLog.deleteMany({ where: { ownerId: owner.id } });
    await db.outboxEvent.deleteMany({ where: { ownerId: owner.id } });
    await db.task.deleteMany({ where: { ownerId: owner.id } });
    await db.project.deleteMany({ where: { ownerId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
  }
});
