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

it('TTD-AUD-11 RF-2201 RF-2203: automation and API share a complete local Monday report', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-18T12:30:00.000Z'));
  const email = `weekly-automation-${randomUUID()}@reflexionia.test`;
  const owner = await db.user.create({
    data: {
      email,
      displayName: 'Weekly automation',
      timeZone: 'Pacific/Kiritimati',
      weeklyReportSettings: { tone: 'neutro', channels: ['email'] },
    },
  });
  try {
    const project = await db.project.create({
      data: { ownerId: owner.id, name: 'Inbox', isInbox: true },
    });
    await db.task.create({
      data: {
        ownerId: owner.id,
        createdById: owner.id,
        projectId: project.id,
        title: 'Completed on local Monday',
        status: 'completed',
        createdAt: new Date('2026-10-18T11:00:00Z'),
        completedAt: new Date('2026-10-18T11:30:00Z'),
      },
    });
    await db.focusSession.create({
      data: {
        ownerId: owner.id,
        type: 'focus',
        plannedMinutes: 30,
        actualSeconds: 1800,
        completed: true,
        startedAt: new Date('2026-10-18T11:00:00Z'),
        endedAt: new Date('2026-10-18T11:30:00Z'),
      },
    });
    const habit = await db.habit.create({
      data: {
        ownerId: owner.id,
        name: 'Water',
        goal: { times_per_period: 1, period: 'day', target_count: 1 },
        frequency: ['monday'],
        createdAt: new Date('2026-10-17'),
      },
    });
    await db.habitLog.create({
      data: { ownerId: owner.id, habitId: habit.id, date: new Date('2026-10-19'), count: 1 },
    });
    const automation = await db.automation.create({
      data: {
        ownerId: owner.id,
        name: 'Weekly report',
        trigger: { cron: '0 20 * * 0' },
        actions: [{ type: 'notify', channel: 'report', text: 'weekly' }],
      },
    });
    await request(server)
      .post(`/api/v1/automations/${automation.id}/run`)
      .set('X-Dev-User-Email', email)
      .expect(204);
    const stored = await db.weeklyReport.findFirstOrThrow({ where: { ownerId: owner.id } });
    expect(stored.weekStart.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(stored.tone).toBe('neutro');
    expect(stored.payload).toMatchObject({
      calculated_at: '2026-10-18T12:30:00.000Z',
      time_zone: 'Pacific/Kiritimati',
      metrics_version: 2,
      completed: 1,
      created: 1,
      focus_minutes: 30,
      habits_done: 1,
      habits_expected: 1,
    });
    const payload = stored.payload as { days: unknown[] };
    expect(payload.days).toHaveLength(7);
    const manual = await request(server)
      .post('/api/v1/reports/weekly')
      .set('X-Dev-User-Email', email)
      .expect(200);
    expect(manual.body.id).toBe(stored.id);
    expect(manual.body.days).toEqual(payload.days);
    expect(await db.weeklyReport.count({ where: { ownerId: owner.id } })).toBe(1);
  } finally {
    vi.useRealTimers();
    await db.automationRun.deleteMany({ where: { automation: { ownerId: owner.id } } });
    await db.automation.deleteMany({ where: { ownerId: owner.id } });
    await db.activityLog.deleteMany({ where: { ownerId: owner.id } });
    await db.outboxEvent.deleteMany({ where: { ownerId: owner.id } });
    await db.weeklyReport.deleteMany({ where: { ownerId: owner.id } });
    await db.focusSession.deleteMany({ where: { ownerId: owner.id } });
    await db.habitLog.deleteMany({ where: { ownerId: owner.id } });
    await db.habit.deleteMany({ where: { ownerId: owner.id } });
    await db.task.deleteMany({ where: { ownerId: owner.id } });
    await db.project.deleteMany({ where: { ownerId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
  }
});
