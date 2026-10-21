import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';
import { nextOccurrence } from '@reflexionia/domain';
import { SchedulerService } from '../src/scheduler/scheduler.service.js';

type SuperTestApp = Parameters<typeof request>[0];

loadRootEnv();
process.env.AUTH_MODE = 'dev';
process.env.SCHEDULER_AUTOSTART = 'false';

const prisma = new PrismaClient();

interface Owner {
  id: string;
  email: string;
  inboxId: string;
}

async function createOwner(name: string): Promise<Owner> {
  const email = `${name}-${randomUUID()}@reflexionia.test`;
  const user = await prisma.user.create({
    data: { email, displayName: name, timeZone: 'Europe/Madrid' },
  });
  const inbox = await prisma.project.create({
    data: { ownerId: user.id, name: 'Bandeja', isInbox: true },
  });
  return { id: user.id, email, inboxId: inbox.id };
}

async function removeOwner(id: string): Promise<void> {
  await prisma.seriesAdvance.deleteMany({ where: { ownerId: id } });
  await prisma.reminderDelivery.deleteMany({ where: { ownerId: id } });
  await prisma.reminder.deleteMany({ where: { ownerId: id } });
  await prisma.pushSubscription.deleteMany({ where: { ownerId: id } });
  await prisma.idempotencyRecord.deleteMany({ where: { ownerId: id } });
  await prisma.outboxEvent.deleteMany({ where: { ownerId: id } });
  await prisma.activityLog.deleteMany({ where: { ownerId: id } });
  await prisma.checklistItem.deleteMany({ where: { ownerId: id } });
  await prisma.task.updateMany({ where: { ownerId: id }, data: { parentId: null } });
  await prisma.task.deleteMany({ where: { ownerId: id } });
  await prisma.project.deleteMany({ where: { ownerId: id } });
  await prisma.user.delete({ where: { id } });
}

describe('time API', () => {
  let app: INestApplication;
  let server: SuperTestApp;
  let scheduler: SchedulerService;
  let owner: Owner;

  beforeAll(async () => {
    await prisma.$connect();
    owner = await createOwner('time');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as SuperTestApp;
    scheduler = app.get(SchedulerService);
  });

  afterAll(async () => {
    await app.close();
    await removeOwner(owner.id);
    await prisma.$disconnect();
  });

  function authed() {
    const header = { 'X-Dev-User-Email': owner.email };
    return {
      get: (url: string) => request(server).get(url).set(header),
      post: (url: string) => request(server).post(url).set(header),
      patch: (url: string) => request(server).patch(url).set(header),
      del: (url: string) => request(server).delete(url).set(header),
    };
  }

  it('RF-601 and RF-604: a task keeps the capture zone when the profile zone changes', async () => {
    const created = await authed()
      .post('/api/v1/tasks')
      .send({
        project_id: owner.inboxId,
        title: 'reunión',
        start_date: '2026-10-19T06:00:00.000Z',
        due_date: '2026-10-19T07:00:00.000Z',
        time_zone: 'Europe/Madrid',
        is_all_day: false,
        duration_minutes: 60,
      })
      .expect(201);
    expect(created.body.due_date).toBe('2026-10-19T07:00:00.000Z');
    expect(created.body.time_zone).toBe('Europe/Madrid');
    expect(created.body.duration_minutes).toBe(60);

    await authed().patch('/api/v1/me').send({ time_zone: 'America/New_York' }).expect(200);
    const again = await authed()
      .get(`/api/v1/tasks/${created.body.id as string}`)
      .expect(200);
    expect(again.body.due_date).toBe('2026-10-19T07:00:00.000Z');
    expect(again.body.time_zone).toBe('Europe/Madrid');
    await authed().patch('/api/v1/me').send({ time_zone: 'Europe/Madrid' }).expect(200);
  });

  it('RF-603 and RF-605: overdue lists a past task, and snooze moves it to tomorrow', async () => {
    const created = await authed()
      .post('/api/v1/tasks')
      .send({
        project_id: owner.inboxId,
        title: 'vencida',
        due_date: '2026-10-01T07:00:00.000Z',
        time_zone: 'Europe/Madrid',
      })
      .expect(201);
    const overdue = await authed().get('/api/v1/tasks?overdue=true').expect(200);
    expect(overdue.body.items.map((item: { id: string }) => item.id)).toContain(created.body.id);

    const snoozed = await authed()
      .post(`/api/v1/tasks/${created.body.id as string}/snooze`)
      .send({ preset: 'tomorrow' })
      .expect(200);
    expect(snoozed.body.due_date).not.toBe('2026-10-01T07:00:00.000Z');
    expect(new Date(snoozed.body.due_date as string).getTime()).toBeGreaterThan(Date.now());
  });

  it('RF-704, RF-706 and REC-1/2: completing an overdue monthly on the 31st materializes the next future 31st', async () => {
    const created = await authed()
      .post('/api/v1/tasks')
      .send({
        project_id: owner.inboxId,
        title: 'cierre mensual',
        due_date: '2026-01-31T08:00:00.000Z',
        time_zone: 'Europe/Madrid',
        repeat_rule: 'RRULE:FREQ=MONTHLY;BYMONTHDAY=31',
      })
      .expect(201);
    await authed()
      .post(`/api/v1/tasks/${created.body.id as string}/items`)
      .send({ title: 'revisar' })
      .expect(201);
    await authed()
      .post(`/api/v1/tasks/${created.body.id as string}/complete`)
      .send({
        complete_children: 'complete',
        advance: 'next_future',
        materialize_next: true,
      })
      .expect(200);

    const listed = await authed()
      .get(
        `/api/v1/tasks/${created.body.id as string}/occurrences?from=2026-01-01T00:00:00.000Z&to=2026-03-31T23:00:00.000Z`,
      )
      .expect(200);
    expect(listed.body.occurrences.map((item: { due_date: string }) => item.due_date)).toEqual([
      '2026-01-31T08:00:00.000Z',
      '2026-02-28T08:00:00.000Z',
      '2026-03-31T07:00:00.000Z',
    ]);

    const rows = await prisma.task.findMany({
      where: { ownerId: owner.id, title: 'cierre mensual', deletedAt: null },
      include: { checklist: true },
      orderBy: { dueDate: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.status).toBe('completed');
    expect(rows[1]?.status).toBe('active');
    const completedAt = rows[0]?.completedAt?.toISOString() ?? new Date().toISOString();
    const expected = nextOccurrence({
      repeatRule: 'RRULE:FREQ=MONTHLY;BYMONTHDAY=31',
      repeatFrom: 'due_date',
      dueDate: '2026-01-31T08:00:00.000Z',
      startDate: null,
      completedAt,
      timeZone: 'Europe/Madrid',
      isAllDay: false,
      occurrenceIndex: 1,
      advance: 'next_future',
      now: completedAt,
    });
    expect(expected.ok).toBe(true);
    if (!expected.ok || expected.occurrence === null) {
      throw new Error('expected a future monthly occurrence');
    }
    expect(rows[1]?.dueDate?.toISOString()).toBe(expected.occurrence.dueDate);
    expect(Date.parse(expected.occurrence.dueDate)).toBeGreaterThan(Date.parse(completedAt));
    expect(rows[1]?.checklist[0]?.status).toBe('active');
    expect(rows[1]?.seriesId).toBe(rows[0]?.seriesId);

    const blocked = await authed()
      .post(`/api/v1/tasks/${created.body.id as string}/uncomplete`)
      .expect(409);
    expect(blocked.body.error.code).toBe('series_already_advanced');
  });

  it('RF-705: detaching a future occurrence leaves the series and adds a standalone task', async () => {
    const created = await authed()
      .post('/api/v1/tasks')
      .send({
        project_id: owner.inboxId,
        title: 'serie',
        due_date: '2026-10-19T07:00:00.000Z',
        time_zone: 'Europe/Madrid',
        repeat_rule: 'RRULE:FREQ=DAILY',
      })
      .expect(201);
    const detached = await authed()
      .post(`/api/v1/tasks/${created.body.id as string}/occurrences/detach`)
      .send({ due_date: '2026-10-20T07:00:00.000Z', title: 'excepción' })
      .expect(201);
    expect(detached.body.series_id).toBeNull();
    expect(detached.body.repeat_rule).toBeNull();
    expect(detached.body.title).toBe('excepción');

    const head = await authed()
      .get(`/api/v1/tasks/${created.body.id as string}`)
      .expect(200);
    expect(head.body.repeat_rule).toContain('EXDATE:');
    await authed()
      .post(`/api/v1/tasks/${created.body.id as string}/complete`)
      .send({})
      .expect(200);
    await scheduler.run(new Date('2026-10-19T12:00:00.000Z'), false);
    const next = await prisma.task.findFirst({
      where: { ownerId: owner.id, seriesId: created.body.series_id as string, status: 'active' },
    });
    expect(next?.dueDate?.toISOString()).toBe('2026-10-21T07:00:00.000Z');
  });

  it('RF-801 and RF-808: a missed reminder is caught up and marked late', async () => {
    const created = await authed()
      .post('/api/v1/tasks')
      .send({
        project_id: owner.inboxId,
        title: 'avisar',
        due_date: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        time_zone: 'Europe/Madrid',
      })
      .expect(201);
    await authed()
      .post(`/api/v1/tasks/${created.body.id as string}/reminders`)
      .send({ trigger: 'TRIGGER:PT0S', type: 'relative', channel: 'email' })
      .expect(201);

    const result = await scheduler.run(new Date(), true);
    expect(result.late).toBeGreaterThan(0);
    const delivery = await prisma.reminderDelivery.findFirst({
      where: { taskId: created.body.id as string, kind: 'task' },
    });
    expect(delivery?.status).toBe('late');
    const payload = delivery?.payload as { delivery?: { email?: string } } | null;
    const email = payload?.delivery?.email;
    expect(email).toBe((process.env.SMTP_HOST ?? '').length > 0 ? 'sent' : 'skipped');
    const event = await prisma.outboxEvent.findFirst({
      where: { ownerId: owner.id, type: 'reminder.fired@v1' },
    });
    expect(event).not.toBeNull();
    const overdue = await prisma.outboxEvent.findFirst({
      where: { ownerId: owner.id, type: 'task.overdue@v1' },
    });
    expect(overdue).not.toBeNull();
  });

  it('RF-2003: a fired reminder is also sent to the linked Telegram chat', async () => {
    await prisma.telegramLink.create({ data: { ownerId: owner.id, chatId: '9001' } });
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    const original = globalThis.fetch;
    const chats: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url =
        input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url;
      if (url.startsWith('https://api.telegram.org/')) {
        const raw = typeof init?.body === 'string' ? init.body : '';
        const body = raw.length === 0 ? {} : (JSON.parse(raw) as { chat_id?: unknown });
        if (typeof body.chat_id === 'string') {
          chats.push(body.chat_id);
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return original(input, init);
    };
    try {
      const created = await authed()
        .post('/api/v1/tasks')
        .send({
          project_id: owner.inboxId,
          title: 'avisar por telegram',
          due_date: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          time_zone: 'Europe/Madrid',
        })
        .expect(201);
      await authed()
        .post(`/api/v1/tasks/${created.body.id as string}/reminders`)
        .send({ trigger: 'TRIGGER:PT0S', type: 'relative', channel: 'push' })
        .expect(201);
      await scheduler.run(new Date(), true);
      expect(chats).toContain('9001');
    } finally {
      globalThis.fetch = original;
      delete process.env.TELEGRAM_BOT_TOKEN;
      await prisma.telegramLink.deleteMany({ where: { ownerId: owner.id } });
    }
  });

  it('RF-805: the daily reminder time is stored and does not rewrite tasks', async () => {
    const before = await prisma.task.findFirst({
      where: { ownerId: owner.id, title: 'reunión' },
    });
    await authed().patch('/api/v1/me').send({ daily_reminder_time: '08:00' }).expect(200);
    const after = await prisma.task.findFirst({
      where: { ownerId: owner.id, title: 'reunión' },
    });
    expect(after?.dueDate?.toISOString()).toBe(before?.dueDate?.toISOString());
    const me = await authed().get('/api/v1/me').expect(200);
    expect(me.body.daily_reminder_time).toBe('08:00');
  });

  it('RF-701: a repeating task without a due date is rejected', async () => {
    const rejected = await authed()
      .post('/api/v1/tasks')
      .send({ project_id: owner.inboxId, title: 'sin fecha', repeat_rule: 'RRULE:FREQ=DAILY' })
      .expect(400);
    expect(rejected.body.error.message).toBe('a repeating task needs a due_date');
  });

  it('RF-704: duplicating a series gives the copy its own series', async () => {
    const created = await authed()
      .post('/api/v1/tasks')
      .send({
        project_id: owner.inboxId,
        title: 'original',
        due_date: '2026-10-19T07:00:00.000Z',
        time_zone: 'Europe/Madrid',
        repeat_rule: 'RRULE:FREQ=DAILY',
      })
      .expect(201);
    const copy = await authed()
      .post(`/api/v1/tasks/${created.body.id as string}/duplicate`)
      .expect(201);
    expect(copy.body.series_id).toBe(copy.body.id);
    expect(copy.body.series_id).not.toBe(created.body.series_id);
    await authed()
      .post(`/api/v1/tasks/${copy.body.id as string}/complete`)
      .send({ advance: 'next_future', materialize_next: true })
      .expect(200);
    const completed = await prisma.task.findFirstOrThrow({
      where: { id: copy.body.id as string },
    });
    const completedAt = completed.completedAt?.toISOString() ?? new Date().toISOString();
    const expected = nextOccurrence({
      repeatRule: 'RRULE:FREQ=DAILY',
      repeatFrom: 'due_date',
      dueDate: '2026-10-19T07:00:00.000Z',
      startDate: null,
      completedAt,
      timeZone: 'Europe/Madrid',
      isAllDay: false,
      occurrenceIndex: 1,
      advance: 'next_future',
      now: completedAt,
    });
    expect(expected.ok).toBe(true);
    if (!expected.ok || expected.occurrence === null) {
      throw new Error('expected a future daily occurrence');
    }
    const next = await prisma.task.findFirst({
      where: { seriesId: copy.body.series_id as string, status: 'active', deletedAt: null },
    });
    expect(next?.dueDate?.toISOString()).toBe(expected.occurrence.dueDate);
  });

  it('RF-803 and RF-804: a constant reminder reschedules, and snoozing drops that delivery', async () => {
    const created = await authed()
      .post('/api/v1/tasks')
      .send({
        project_id: owner.inboxId,
        title: 'insistir',
        due_date: new Date(Date.now() - 60 * 1000).toISOString(),
        time_zone: 'Europe/Madrid',
      })
      .expect(201);
    const reminder = await authed()
      .post(`/api/v1/tasks/${created.body.id as string}/reminders`)
      .send({ trigger: 'TRIGGER:PT0S', type: 'relative', channel: 'push', constant: true })
      .expect(201);
    await scheduler.run(new Date(), true);
    const next = await prisma.reminderDelivery.findFirst({
      where: { reminderId: reminder.body.id as string, status: 'scheduled' },
    });
    expect(next?.fireAt.getTime()).toBeGreaterThan(Date.now());
    const snoozed = await authed()
      .post(
        `/api/v1/tasks/${created.body.id as string}/reminders/${reminder.body.id as string}/snooze`,
      )
      .send({ preset: '10m' })
      .expect(200);
    expect(snoozed.body.snoozed_until).not.toBeNull();
    const left = await prisma.reminderDelivery.count({
      where: { reminderId: reminder.body.id as string, status: 'scheduled' },
    });
    expect(left).toBe(0);
  });

  it('RF-802: a push subscription can be registered and removed', async () => {
    const created = await authed()
      .post('/api/v1/me/push-subscriptions')
      .send({ endpoint: `https://push.example/${owner.id}`, p256dh: 'key', auth: 'secret' })
      .expect(201);
    await authed()
      .del(`/api/v1/me/push-subscriptions/${created.body.id as string}`)
      .expect(204);
  });
});
