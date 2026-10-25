import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
process.env.AUTH_MODE = 'dev';
const prisma = new PrismaClient();
describe('F day planning', () => {
  let app: INestApplication;
  let ownerId: string;
  let projectId: string;
  const email = `wt-f-${randomUUID()}@example.test`;
  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.endsWith('/ttd_wt_f'))
      throw new Error('F integration tests require the isolated ttd_wt_f database');
    const owner = await prisma.user.create({
      data: { email, displayName: 'F test', timeZone: 'Europe/Madrid' },
    });
    ownerId = owner.id;
    projectId = (
      await prisma.project.create({ data: { ownerId, name: 'F synthetic', isInbox: true } })
    ).id;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => {
    if (app) await app.close();
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });
  const call = () => request(app.getHttpServer() as Parameters<typeof request>[0]);
  async function makeTask(dueDate: Date | null = null) {
    return prisma.task.create({
      data: {
        ownerId,
        projectId,
        createdById: ownerId,
        title: 'Synthetic F task',
        dueDate,
        timeZone: 'Europe/Madrid',
      },
    });
  }
  async function start() {
    return call()
      .post('/api/v1/planning/sessions')
      .set('X-Dev-User-Email', email)
      .send({ local_date: '2026-10-26', time_zone: 'Europe/Madrid', inbox: true, undated: true })
      .expect(201);
  }
  it('F-AC-5: reuses one draft and rejects confirmation without changes', async () => {
    const first = await start(),
      second = await start();
    expect(second.body.id).toBe(first.body.id);
    await call()
      .post(`/api/v1/planning/sessions/${first.body.id}/apply`)
      .set('X-Dev-User-Email', email)
      .set('Idempotency-Key', randomUUID())
      .send({ expected_revision: first.body.revision })
      .expect(422)
      .expect((res) => expect(res.body.error.code).toBe('nothing_to_apply'));
  });
  it('F-AC-29: reverts a plan idempotently and rejects edits made after confirmation', async () => {
    const task = await makeTask();
    const session = await start();
    const chosen = await call()
      .put(`/api/v1/planning/sessions/${session.body.id}/decisions/${task.id}`)
      .set('X-Dev-User-Email', email)
      .send({ action: 'today' })
      .expect(200);
    const applied = await call()
      .post(`/api/v1/planning/sessions/${session.body.id}/apply`)
      .set('X-Dev-User-Email', email)
      .set('Idempotency-Key', randomUUID())
      .send({ expected_revision: chosen.body.revision })
      .expect(200);
    for (let i = 0; i < 2; i += 1)
      await call()
        .post(`/api/v1/planning/operations/${applied.body.operation_id}/revert`)
        .set('X-Dev-User-Email', email)
        .expect(201);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).startDate).toBeNull();
    const again = await start();
    const changed = await call()
      .put(`/api/v1/planning/sessions/${again.body.id}/decisions/${task.id}`)
      .set('X-Dev-User-Email', email)
      .send({ action: 'today' })
      .expect(200);
    const saved = await call()
      .post(`/api/v1/planning/sessions/${again.body.id}/apply`)
      .set('X-Dev-User-Email', email)
      .set('Idempotency-Key', randomUUID())
      .send({ expected_revision: changed.body.revision })
      .expect(200);
    await prisma.task.update({ where: { id: task.id }, data: { title: 'Changed externally' } });
    await call()
      .post(`/api/v1/planning/operations/${saved.body.operation_id}/revert`)
      .set('X-Dev-User-Email', email)
      .expect(409);
  });
  it('F-AC-2/3/4: preserves deadline, writes only chosen duration and records plan activity', async () => {
    const task = await makeTask();
    const session = await start();
    const decision = await call()
      .put(`/api/v1/planning/sessions/${session.body.id}/decisions/${task.id}`)
      .set('X-Dev-User-Email', email)
      .send({ action: 'tomorrow', time: '09:30', duration: 30 })
      .expect(200);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).startDate).toBeNull();
    await call()
      .post(`/api/v1/planning/sessions/${session.body.id}/apply`)
      .set('X-Dev-User-Email', email)
      .set('Idempotency-Key', randomUUID())
      .send({ expected_revision: decision.body.revision })
      .expect(200);
    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(after.startDate?.toISOString()).toBe('2026-10-27T08:30:00.000Z');
    expect(after.dueDate).toBeNull();
    expect(after.durationMinutes).toBe(30);
    const activity = await call()
      .get(`/api/v1/tasks/${task.id}/activity`)
      .set('X-Dev-User-Email', email)
      .expect(200);
    expect(JSON.stringify(activity.body)).toContain('plan');
  });
  it('F-AC-2: permits planning after an expired deadline without changing it or estimating duration', async () => {
    const dueDate = new Date('2026-10-23T09:00:00Z');
    const task = await makeTask(dueDate);
    const session = await start();
    const decision = await call()
      .put(`/api/v1/planning/sessions/${session.body.id}/decisions/${task.id}`)
      .set('X-Dev-User-Email', email)
      .send({ action: 'today' })
      .expect(200);
    await call()
      .post(`/api/v1/planning/sessions/${session.body.id}/apply`)
      .set('X-Dev-User-Email', email)
      .set('Idempotency-Key', randomUUID())
      .send({ expected_revision: decision.body.revision })
      .expect(200);
    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(after.startDate?.toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(after.dueDate).toEqual(dueDate);
    expect(after.durationMinutes).toBeNull();
  });
});
