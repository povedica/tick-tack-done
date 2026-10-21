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
