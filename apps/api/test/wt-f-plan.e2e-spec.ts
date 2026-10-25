import { newPersonalAccessToken } from '../src/auth/token-secret.js';
import { civilDateKey, isBusinessDay, shiftCivilDate } from '@reflexionia/domain';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TasksService } from '../src/modules/tasks/tasks.service.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
process.env.AUTH_MODE = 'dev';
const prisma = new PrismaClient();
describe('F day planning', () => {
  let app: INestApplication;
  let ownerId: string;
  let projectId: string;
  const previousPort = process.env.PORT;
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
    await app.listen(0, '127.0.0.1');
    process.env.PORT = new URL(await app.getUrl()).port;
  });
  afterAll(async () => {
    await app.close();
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
    if (ownerId) {
      await prisma.planOperation.deleteMany({ where: { ownerId } });
      await prisma.planDecision.deleteMany({ where: { session: { ownerId } } });
      await prisma.planMember.deleteMany({ where: { plan: { ownerId } } });
      await prisma.planSession.deleteMany({ where: { ownerId } });
      await prisma.dayPlan.deleteMany({ where: { ownerId } });
      await prisma.seriesAdvance.deleteMany({ where: { ownerId } });
      await prisma.idempotencyRecord.deleteMany({ where: { ownerId } });
      await prisma.outboxEvent.deleteMany({ where: { ownerId } });
      await prisma.activityLog.deleteMany({ where: { ownerId } });
      await prisma.personalAccessToken.deleteMany({ where: { ownerId } });
      await prisma.taskTag.deleteMany({ where: { task: { ownerId } } });
      await prisma.task.deleteMany({ where: { ownerId } });
      await prisma.project.deleteMany({ where: { ownerId } });
      await prisma.user.delete({ where: { id: ownerId } });
    }
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
  it('F-AC-29 / RF-2001: MCP starts, records, previews, applies and reverts through public guards', async () => {
    const secret = newPersonalAccessToken();
    await prisma.personalAccessToken.create({
      data: {
        ownerId,
        name: 'F synthetic MCP',
        tokenHash: secret.hash,
        tokenPrefix: secret.prefix,
        scopes: ['tasks:read', 'tasks:write'],
      },
    });
    let date = civilDateKey(new Date().toISOString(), 'Europe/Madrid') ?? '';
    while (!isBusinessDay(date)) date = shiftCivilDate(date, 1);
    const task = await makeTask();
    async function tool(name: string, args: Record<string, unknown>) {
      const response = await call()
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${secret.token}`)
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
        .expect(200);
      expect(response.body.result.isError, JSON.stringify(response.body.result)).toBe(false);
      return JSON.parse(String(response.body.result.content[0].text)) as Record<string, unknown>;
    }
    const started = await tool('start_day_plan', { date, inbox: true, undated: true });
    const decided = await tool('record_plan_decision', {
      session_id: started.id,
      task_id: task.id,
      action: 'today',
      time: '09:30',
      duration: 30,
    });
    await tool('apply_day_plan', { session_id: started.id });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).startDate).toBeNull();
    const applied = await tool('apply_day_plan', {
      session_id: started.id,
      auto_apply: true,
      expected_revision: decided.revision,
      idempotency_key: randomUUID(),
    });
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(row.startDate).not.toBeNull();
    expect(row.dueDate).toBeNull();
    await tool('get_day_plan', { date });
    const range = await tool('get_day_load', { date, days: 14 });
    expect(range.days).toHaveLength(14);
    await tool('revert_day_plan', { operation_id: applied.operation_id });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).startDate).toBeNull();
    const readOnly = newPersonalAccessToken();
    await prisma.personalAccessToken.create({
      data: {
        ownerId,
        name: 'F read only',
        tokenHash: readOnly.hash,
        tokenPrefix: readOnly.prefix,
        scopes: ['tasks:read'],
      },
    });
    const denied = await call()
      .post('/api/v1/mcp')
      .set('Authorization', `Bearer ${readOnly.token}`)
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'start_day_plan', arguments: { date } },
      })
      .expect(200);
    expect(denied.body.result.isError).toBe(true);
  });
  it('F-AC-1: a multi-day task never contributes more than a workday and uses the profile zone', async () => {
    const task = await makeTask(new Date('2026-10-26T12:00:00Z'));
    await prisma.task.update({
      where: { id: task.id },
      data: { startDate: new Date('2026-10-20T08:00:00Z'), durationMinutes: 8820, isAllDay: false },
    });
    await call()
      .put('/api/v1/planning/settings/work-days')
      .set('X-Dev-User-Email', email)
      .send({ work_days: [0, 1, 2, 3, 4, 5, 6] })
      .expect(200);
    const range = await call()
      .get('/api/v1/planning/load?from=2026-10-20&days=7&time_zone=Pacific/Honolulu')
      .set('X-Dev-User-Email', email)
      .expect(200);
    expect(range.body.time_zone).toBe('Europe/Madrid');
    expect(range.body.days).toHaveLength(7);
    for (const day of range.body.days) {
      expect(day.task_minutes).toBeLessThanOrEqual(540);
      expect(day.task_minutes).toBeGreaterThan(0);
    }
    await prisma.task.delete({ where: { id: task.id } });
    await call()
      .put('/api/v1/planning/settings/work-days')
      .set('X-Dev-User-Email', email)
      .send({ work_days: [1, 2, 3, 4, 5] })
      .expect(200);
  });
  it('F-AC-30: skipping a habit affects only the planned occurrence and revert restores it', async () => {
    const habit = await prisma.habit.create({
      data: {
        ownerId,
        name: 'Synthetic F habit',
        goal: { times_per_period: 1, period: 'day', target_count: 1 },
        frequency: ['monday'],
      },
    });
    const session = await start();
    expect(session.body.cards).toContainEqual(
      expect.objectContaining({ task_id: habit.id, habit: true }),
    );
    const choice = await call()
      .put(`/api/v1/planning/sessions/${session.body.id}/decisions/${habit.id}`)
      .set('X-Dev-User-Email', email)
      .send({ action: 'wont_do' })
      .expect(200);
    const applied = await call()
      .post(`/api/v1/planning/sessions/${session.body.id}/apply`)
      .set('X-Dev-User-Email', email)
      .set('Idempotency-Key', randomUUID())
      .send({ expected_revision: choice.body.revision })
      .expect(200);
    const row = await prisma.habit.findUniqueOrThrow({ where: { id: habit.id } });
    expect(row.archived).toBe(false);
    expect(row.deletedAt).toBeNull();
    await call()
      .post(`/api/v1/planning/operations/${applied.body.operation_id}/revert`)
      .set('X-Dev-User-Email', email)
      .expect(201);
    await prisma.habit.delete({ where: { id: habit.id } });
  });
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
      .expect((res) => {
        expect(res.body.error.code).toBe('nothing_to_apply');
      });
  });
  it('F-AC-30: moving a repeating task detaches only its current occurrence', async () => {
    const task = await makeTask(new Date('2026-10-25T23:00Z'));
    await prisma.task.update({
      where: { id: task.id },
      data: { repeatRule: 'RRULE:FREQ=DAILY', seriesId: task.id, isAllDay: true },
    });
    const session = await start();
    const choice = await call()
      .put(`/api/v1/planning/sessions/${session.body.id}/decisions/${task.id}`)
      .set('X-Dev-User-Email', email)
      .send({ action: 'tomorrow' })
      .expect(200);
    await call()
      .post(`/api/v1/planning/sessions/${session.body.id}/apply`)
      .set('X-Dev-User-Email', email)
      .set('Idempotency-Key', randomUUID())
      .send({ expected_revision: choice.body.revision })
      .expect(200);
    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(after.repeatRule).toBeNull();
    expect(after.startDate?.toISOString()).toBe('2026-10-26T23:00:00.000Z');
    expect(
      await prisma.seriesAdvance.count({ where: { sourceTaskId: task.id, processedAt: null } }),
    ).toBe(1);
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
        .expect((res) => {
          expect(res.status, JSON.stringify(res.body)).toBe(201);
        });
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
      .get(`/api/v1/tasks/${task.id}`)
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
  it('F-AC-4: a failed task write rolls back the complete plan operation and prior task writes', async () => {
    const first = await makeTask();
    const second = await makeTask();
    const session = await start();
    let revision = session.body.revision as number;
    for (const task of [first, second]) {
      const choice = await call()
        .put(`/api/v1/planning/sessions/${String(session.body.id)}/decisions/${task.id}`)
        .set('X-Dev-User-Email', email)
        .send({ action: 'today' })
        .expect(200);
      revision = Number(choice.body.revision);
    }
    const tasks = app.get(TasksService);
    const update = tasks.update.bind(tasks);
    const spy = vi
      .spyOn(tasks, 'update')
      .mockImplementationOnce(update)
      .mockRejectedValueOnce(new Error('Synthetic second write failure'));
    try {
      await call()
        .post(`/api/v1/planning/sessions/${String(session.body.id)}/apply`)
        .set('X-Dev-User-Email', email)
        .set('Idempotency-Key', randomUUID())
        .send({ expected_revision: revision })
        .expect(500);
      for (const task of [first, second]) {
        const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
        expect(row.startDate).toBeNull();
        expect(row.version).toBe(task.version);
      }
      expect(
        await prisma.planOperation.count({ where: { sessionId: String(session.body.id) } }),
      ).toBe(0);
      expect(
        (await prisma.planSession.findUniqueOrThrow({ where: { id: String(session.body.id) } }))
          .state,
      ).toBe('draft');
    } finally {
      spy.mockRestore();
    }
  });
  it('F-AC-13: the projected 45-minute choice agrees with persisted daily load after confirmation', async () => {
    const date = '2026-11-06';
    const task = await makeTask();
    const before = await call()
      .get(`/api/v1/planning/load?from=${date}&days=1`)
      .set('X-Dev-User-Email', email)
      .expect(200);
    const session = await start();
    const choice = await call()
      .put(`/api/v1/planning/sessions/${String(session.body.id)}/decisions/${task.id}`)
      .set('X-Dev-User-Email', email)
      .send({ action: 'move', date, duration: 45 })
      .expect(200);
    await call()
      .post(`/api/v1/planning/sessions/${String(session.body.id)}/apply`)
      .set('X-Dev-User-Email', email)
      .set('Idempotency-Key', randomUUID())
      .send({ expected_revision: choice.body.revision })
      .expect(200);
    const after = await call()
      .get(`/api/v1/planning/load?from=${date}&days=1`)
      .set('X-Dev-User-Email', email)
      .expect(200);
    expect(Number(after.body.days[0].task_minutes) - Number(before.body.days[0].task_minutes)).toBe(
      45,
    );
    expect(after.body.days[0].event_minutes).toBe(before.body.days[0].event_minutes);
  });
});
