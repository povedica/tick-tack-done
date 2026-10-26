import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';

type SuperTestApp = Parameters<typeof request>[0];

loadRootEnv();
process.env.AUTH_MODE = 'dev';
process.env.ATTACHMENT_DIR = `/tmp/reflexionia-attachments-${randomUUID()}`;

const prisma = new PrismaClient();
const ZONE = 'Europe/Madrid';
/** Civil 2026-10-20 all-day in Europe/Madrid (CEST). */
const DAY = '2026-10-19T22:00:00.000Z';
const DAY_LATER = '2026-10-21T22:00:00.000Z';

interface Owner {
  id: string;
  email: string;
  inboxId: string;
}

async function createOwner(name: string): Promise<Owner> {
  const email = `${name}-${randomUUID()}@reflexionia.test`;
  const user = await prisma.user.create({
    data: {
      email,
      displayName: name,
      workDayStart: '09:00',
      workDayEnd: '18:00',
      defaultTaskDuration: 30,
    },
  });
  const inbox = await prisma.project.create({
    data: { ownerId: user.id, name: 'Bandeja', isInbox: true },
  });
  return { id: user.id, email, inboxId: inbox.id };
}

async function removeOwner(id: string): Promise<void> {
  await prisma.planOperation.deleteMany({ where: { ownerId: id } });
  await prisma.planDecision.deleteMany({ where: { session: { ownerId: id } } });
  await prisma.planMember.deleteMany({ where: { plan: { ownerId: id } } });
  await prisma.planSession.deleteMany({ where: { ownerId: id } });
  await prisma.dayPlan.deleteMany({ where: { ownerId: id } });
  await prisma.idempotencyRecord.deleteMany({ where: { ownerId: id } });
  await prisma.outboxEvent.deleteMany({ where: { ownerId: id } });
  await prisma.activityLog.deleteMany({ where: { ownerId: id } });
  await prisma.taskTag.deleteMany({ where: { task: { ownerId: id } } });
  await prisma.task.updateMany({ where: { ownerId: id }, data: { parentId: null } });
  await prisma.task.deleteMany({ where: { ownerId: id } });
  await prisma.project.deleteMany({ where: { ownerId: id } });
  await prisma.user.delete({ where: { id } });
}

describe('day closing, load and someday', () => {
  let app: INestApplication;
  let server: SuperTestApp;
  let owner: Owner;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    await prisma.$connect();
    owner = await createOwner('closing');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as SuperTestApp;
  });

  afterAll(async () => {
    await app.close();
    await removeOwner(owner.id);
    await prisma.$disconnect();
    vi.useRealTimers();
  });

  function api() {
    const header = { 'X-Dev-User-Email': owner.email };
    return {
      get: (url: string) => request(server).get(url).set(header),
      post: (url: string) => request(server).post(url).set(header),
      put: (url: string) => request(server).put(url).set(header),
      patch: (url: string) => request(server).patch(url).set(header),
    };
  }

  it('TTD-AUD-94: source selection returns 18 or one candidate with 17 hidden', async () => {
    const synthetic = await createOwner('r80-sources');
    try {
      await prisma.task.createMany({
        data: Array.from({ length: 18 }, (_, index) => ({
          ownerId: synthetic.id,
          createdById: synthetic.id,
          projectId: synthetic.inboxId,
          title: `Source fixture ${index}`,
          dueDate: new Date(index ? '2026-10-18T22:00:00Z' : DAY),
          timeZone: ZONE,
          isAllDay: true,
        })),
      });
      const input = {
        local_date: '2026-10-20',
        time_zone: ZONE,
        today: true,
        inbox: false,
        undated: false,
      };
      for (const overdue of [true, false]) {
        const response = await request(server)
          .post('/api/v1/planning/sessions')
          .set('X-Dev-User-Email', synthetic.email)
          .send({ ...input, overdue })
          .expect(201);
        expect(response.body.cards).toHaveLength(overdue ? 18 : 1);
        expect(response.body.hidden_overdue).toBe(overdue ? 0 : 17);
        expect(response.body.totals.overdue).toBe(17);
      }
    } finally {
      await removeOwner(synthetic.id);
    }
  });

  it('RF-2641 RF-2646: returns day load and disables it when the workday is empty', async () => {
    const localDate = '2026-10-20';
    const load = await api()
      .get(`/api/v1/planning/load?date=${localDate}&time_zone=${encodeURIComponent(ZONE)}`)
      .expect(200);
    expect(load.body.available_minutes).toBe(540);
    expect(load.body.status).toBe('ok');

    await api().patch('/api/v1/me').send({ work_day_start: null, work_day_end: null }).expect(200);
    const off = await api()
      .get(`/api/v1/planning/load?date=${localDate}&time_zone=${encodeURIComponent(ZONE)}`)
      .expect(200);
    expect(off.body.available_minutes).toBeNull();
    expect(off.body.status).toBe('ok');

    await api()
      .patch('/api/v1/me')
      .send({ work_day_start: '09:00', work_day_end: '18:00' })
      .expect(200);
  });

  it('RF-2610: rejects a deadline before when with 422', async () => {
    const response = await api().post('/api/v1/tasks').set('Idempotency-Key', randomUUID()).send({
      project_id: owner.inboxId,
      title: 'Informe',
      start_date: DAY_LATER,
      due_date: DAY,
      is_all_day: true,
      time_zone: ZONE,
    });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('deadline_before_when');
  });

  it('RF-2620 RF-2625: someday leaves smart today and filters by query', async () => {
    const created = await api()
      .post('/api/v1/tasks')
      .set('Idempotency-Key', randomUUID())
      .send({
        project_id: owner.inboxId,
        title: 'Leer',
        due_date: DAY,
        is_all_day: true,
        time_zone: ZONE,
        someday: true,
      })
      .expect(201);
    expect(created.body.is_someday).toBe(true);

    const active = await api().get('/api/v1/tasks?flat=true').expect(200);
    expect(active.body.items.some((item: { id: string }) => item.id === created.body.id)).toBe(
      false,
    );
    const someday = await api().get('/api/v1/tasks?flat=true&someday=true').expect(200);
    expect(someday.body.items.some((item: { id: string }) => item.id === created.body.id)).toBe(
      true,
    );
  });

  it('RF-2651 RF-2670: shutdown and replan apply are idempotent and conflict on revision', async () => {
    const created = await api()
      .post('/api/v1/tasks')
      .set('Idempotency-Key', randomUUID())
      .send({
        project_id: owner.inboxId,
        title: 'Llamada',
        due_date: DAY,
        is_all_day: true,
        time_zone: ZONE,
        duration_minutes: 45,
      })
      .expect(201);

    const session = await api()
      .post('/api/v1/planning/shutdown/sessions')
      .send({ local_date: '2026-10-20', time_zone: ZONE })
      .expect(201);
    expect(session.body.kind).toBe('shutdown');
    expect(
      session.body.queue.cards.some(
        (card: { task_id: string }) => card.task_id === created.body.id,
      ),
    ).toBe(true);

    const decided = await api()
      .put(`/api/v1/planning/shutdown/sessions/${session.body.id}/decisions/${created.body.id}`)
      .send({ decision: 'plan_day', target_date: '2026-10-21' })
      .expect(200);

    const key = randomUUID();
    const applied = await api()
      .post(`/api/v1/planning/shutdown/sessions/${session.body.id}/apply`)
      .set('Idempotency-Key', key)
      .send({ expected_revision: decided.body.revision })
      .expect(200);
    expect(applied.body.closed).toBe(true);

    const replay = await api()
      .post(`/api/v1/planning/shutdown/sessions/${session.body.id}/apply`)
      .set('Idempotency-Key', key)
      .send({ expected_revision: decided.body.revision })
      .expect(200);
    expect(replay.body.replayed).toBe(true);

    const conflict = await api()
      .post('/api/v1/planning/replan/sessions')
      .send({ local_date: '2026-10-20', time_zone: ZONE })
      .expect(201);
    const bad = await api()
      .post(`/api/v1/planning/replan/sessions/${conflict.body.id}/apply`)
      .set('Idempotency-Key', randomUUID())
      .send({ expected_revision: Number(conflict.body.revision) + 1 })
      .expect(409);
    expect(bad.body.error.code).toBe('revision_conflict');
  });

  it('RF-2671: persisted plan history counts real applications and concurrent replay once', async () => {
    const date = '2026-10-20';
    const url = `/api/v1/plans?date=${date}&time_zone=${encodeURIComponent(ZONE)}`;
    const initialTask = await api()
      .post('/api/v1/tasks')
      .set('Idempotency-Key', randomUUID())
      .send({
        project_id: owner.inboxId,
        title: 'Initial synthetic plan',
        due_date: DAY,
        is_all_day: true,
        time_zone: ZONE,
      })
      .expect(201);
    const started = await api()
      .post('/api/v1/planning/sessions')
      .send({ local_date: date, time_zone: ZONE, today: true, overdue: false })
      .expect(201);
    const initialChoice = await api()
      .put(`/api/v1/planning/sessions/${started.body.id}/decisions/${initialTask.body.id}`)
      .send({ action: 'today' })
      .expect(200);
    const applyUrl = `/api/v1/planning/sessions/${started.body.id}/apply`;
    const key = randomUUID();
    const results = await Promise.all(
      [1, 2].map(() =>
        api()
          .post(applyUrl)
          .set('Idempotency-Key', key)
          .send({ expected_revision: initialChoice.body.revision }),
      ),
    );
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    const initial = await api().get(url).expect(200);
    expect(initial.body.initial_applied_at).toBeTruthy();
    expect(initial.body.adjustment_count).toBe(0);
    const created = await api()
      .post('/api/v1/tasks')
      .set('Idempotency-Key', randomUUID())
      .send({
        project_id: owner.inboxId,
        title: 'Ajuste sintético',
        due_date: DAY,
        is_all_day: true,
        time_zone: ZONE,
      })
      .expect(201);
    const adjustment = await api()
      .post('/api/v1/planning/replan/sessions')
      .send({ local_date: date, time_zone: ZONE, apply_suggestions: false })
      .expect(201);
    expect(adjustment.body.decisions).toEqual([]);
    const viewed = await api().get(url).expect(200);
    expect(viewed.body.adjustment_count).toBe(0);
    const decided = await api()
      .put(`/api/v1/planning/replan/sessions/${adjustment.body.id}/decisions/${created.body.id}`)
      .send({ decision: 'someday' })
      .expect(200);
    const adjustKey = randomUUID();
    for (let replay = 0; replay < 2; replay++)
      await api()
        .post(`/api/v1/planning/replan/sessions/${adjustment.body.id}/apply`)
        .set('Idempotency-Key', adjustKey)
        .send({ expected_revision: decided.body.revision })
        .expect(200);
    const saved = await api().get(url).expect(200);
    expect(saved.body.adjustment_count).toBe(1);
    expect(saved.body.initial_applied_at).toBe(initial.body.initial_applied_at);
    const empty = await api()
      .post('/api/v1/planning/sessions')
      .send({ local_date: date, time_zone: ZONE, today: true, overdue: false })
      .expect(201);
    await api()
      .post(`/api/v1/planning/sessions/${empty.body.id}/apply`)
      .set('Idempotency-Key', randomUUID())
      .send({ expected_revision: empty.body.revision })
      .expect(422);
    const unchanged = await api().get(url).expect(200);
    expect(unchanged.body.adjustment_count).toBe(1);
    expect(unchanged.body.last_applied_at).toBe(saved.body.last_applied_at);
    // Repeating the same actual start date is a no-op, even with a new session/key.
    const laterTask = await api()
      .post('/api/v1/tasks')
      .set('Idempotency-Key', randomUUID())
      .send({
        project_id: owner.inboxId,
        title: 'Sin doble ajuste',
        due_date: DAY,
        is_all_day: true,
        time_zone: ZONE,
      })
      .expect(201);
    for (let pass = 0; pass < 2; pass++) {
      const opened = await api()
        .post('/api/v1/planning/sessions')
        .send({ local_date: date, time_zone: ZONE, today: true, overdue: false })
        .expect(201);
      const choice = await api()
        .put(`/api/v1/planning/sessions/${opened.body.id}/decisions/${laterTask.body.id}`)
        .send({ action: 'today' })
        .expect(200);
      await api()
        .post(`/api/v1/planning/sessions/${opened.body.id}/apply`)
        .set('Idempotency-Key', randomUUID())
        .send({ expected_revision: choice.body.revision })
        .expect(200);
    }
    const final = await api().get(url).expect(200);
    expect(final.body.adjustment_count).toBe(2);
  });

  it('RF-2651: rejects shutdown for a date that is not today or yesterday', async () => {
    const response = await api()
      .post('/api/v1/planning/shutdown/sessions')
      .send({ local_date: '2020-01-01', time_zone: ZONE })
      .expect(422);
    expect(response.body.error.code).toBeTruthy();
  });
});
