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

it('TTD-AUD-129 RF-1201/1202/1205: session writes include task and PUT preserves omitted settings', async () => {
  const owner = await db.user.create({
    data: { email: `wt-e-${randomUUID()}@reflexionia.test`, displayName: 'WT E' },
  });
  const send = () => request(server);
  try {
    const project = await db.project.create({ data: { ownerId: owner.id, name: 'Focus' } });
    const task = {
      body: await db.task.create({
        data: {
          ownerId: owner.id,
          createdById: owner.id,
          projectId: project.id,
          title: 'Associated focus task',
        },
      }),
    };
    await send()
      .put('/api/v1/focus/settings')
      .set('X-Dev-User-Email', owner.email)
      .send({ pomodoro_minutes: 35 })
      .expect(200);
    const merged = await send()
      .put('/api/v1/focus/settings')
      .set('X-Dev-User-Email', owner.email)
      .send({ volume: 50 })
      .expect(200);
    expect(merged.body.pomodoroMinutes).toBe(35);
    await send()
      .put('/api/v1/focus/settings')
      .set('X-Dev-User-Email', owner.email)
      .send({ pomodoro_minutes: 200 })
      .expect(400);
    for (const ending of ['finish', 'abort']) {
      const started = await send()
        .post('/api/v1/focus/sessions')
        .set('X-Dev-User-Email', owner.email)
        .send({ task_id: task.body.id })
        .expect(201);
      expect(started.body.task).toMatchObject({ id: task.body.id, title: 'Associated focus task' });
      for (const action of ['pause', 'resume', ending]) {
        const changed = await send()
          .post(`/api/v1/focus/sessions/${String(started.body.id)}/${action}`)
          .set('X-Dev-User-Email', owner.email)
          .send({})
          .expect(200);
        expect(changed.body.task).toMatchObject({
          id: task.body.id,
          title: 'Associated focus task',
        });
      }
    }
  } finally {
    await db.activityLog.deleteMany({ where: { ownerId: owner.id } });
    await db.outboxEvent.deleteMany({ where: { ownerId: owner.id } });
    await db.focusSession.deleteMany({ where: { ownerId: owner.id } });
    await db.focusSettings.deleteMany({ where: { userId: owner.id } });
    await db.task.deleteMany({ where: { ownerId: owner.id } });
    await db.project.deleteMany({ where: { ownerId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
  }
});
