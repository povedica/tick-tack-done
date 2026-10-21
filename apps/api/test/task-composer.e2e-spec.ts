import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';
loadRootEnv();
process.env.AUTH_MODE = 'dev';
process.env.SCHEDULER_AUTOSTART = 'false';
process.env.BUS_AUTOSTART = 'false';
const prisma = new PrismaClient();
describe('RF-101/102/601/801: task composer explicit metadata', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let owner: string;
  const email = `composer-${randomUUID()}@reflexionia.test`;
  beforeAll(async () => {
    owner = (
      await prisma.user.create({
        data: {
          email,
          displayName: 'Composer test',
          timeZone: 'Europe/Madrid',
          defaultReminderTrigger: 'TRIGGER:-PT5M',
        },
      })
    ).id;
    await prisma.project.create({ data: { ownerId: owner, name: 'Bandeja', isInbox: true } });
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });
  afterAll(async () => {
    await app.close();
    if (owner) {
      await prisma.activityLog.deleteMany({ where: { ownerId: owner } });
      await prisma.outboxEvent.deleteMany({ where: { ownerId: owner } });
      await prisma.idempotencyRecord.deleteMany({ where: { ownerId: owner } });
      await prisma.dayPlan.deleteMany({ where: { ownerId: owner } });
      await prisma.reminder.deleteMany({ where: { ownerId: owner } });
      await prisma.taskTag.deleteMany({ where: { task: { ownerId: owner } } });
      await prisma.task.deleteMany({ where: { ownerId: owner } });
      await prisma.project.deleteMany({ where: { ownerId: owner } });
      await prisma.tag.deleteMany({ where: { ownerId: owner } });
      await prisma.user.deleteMany({ where: { id: owner } });
    }
    await prisma.$disconnect();
  });
  const create = (body: Record<string, unknown>, key = randomUUID()) =>
    request(server)
      .post('/api/v1/tasks')
      .set('X-Dev-User-Email', email)
      .set('Idempotency-Key', key)
      .send(body);
  it.each(['mañana 09:00-09:30', 'mañana de 9 a 9:30', 'tomorrow 9am-10am'])(
    'TTD-AUD-02 RF-102 RF-602: raw range %s persists start and duration',
    async (range) => {
      const response = await create({
        raw_text: `Meeting ${range}`,
        time_zone: 'Europe/Madrid',
      }).expect(201);
      expect(response.body.title).toBe('Meeting');
      expect(response.body.start_date).toEqual(expect.any(String));
      expect(response.body.due_date).toBeNull();
      expect(response.body.is_all_day).toBe(false);
      expect(response.body.duration_minutes).toBe(range.includes('10am') ? 60 : 30);
      const task = await prisma.task.findUniqueOrThrow({
        where: { id: response.body.id as string },
      });
      expect(task.startDate?.toISOString()).toBe(response.body.start_date);
      expect(task.durationMinutes).toBe(response.body.duration_minutes);
    },
  );
  it('RF-102/801: explicit date, duration, recurrence and zero-minute reminder are atomic and idempotent', async () => {
    const key = randomUUID();
    const body = {
      raw_text: 'Propuesta mañana !baja',
      due_date: '2026-10-22T16:00:00Z',
      is_all_day: false,
      time_zone: 'Europe/Madrid',
      priority: 'high',
      duration_minutes: 45,
      repeat_rule: 'RRULE:FREQ=WEEKLY',
      reminder_trigger: 'TRIGGER:-PT0M',
    };
    const first = await create(body, key);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const second = await create(body, key).expect(201);
    expect(second.body.id).toBe(first.body.id);
    const task = await prisma.task.findUniqueOrThrow({ where: { id: first.body.id as string } });
    expect(task.dueDate?.toISOString()).toBe('2026-10-22T16:00:00.000Z');
    expect(task.priority).toBe('high');
    expect(task.durationMinutes).toBe(45);
    expect(task.repeatRule).toBe('RRULE:FREQ=WEEKLY');
    const reminders = await prisma.reminder.findMany({ where: { taskId: task.id } });
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.trigger).toBe('TRIGGER:-PT0M');
  });
  it('RF-102/801: explicit no reminder overrides parsed text and account default', async () => {
    const response = await create({
      raw_text: 'Llamar mañana avísame 30 min antes',
      reminder_trigger: null,
    }).expect(201);
    expect(await prisma.reminder.count({ where: { taskId: response.body.id as string } })).toBe(0);
  });
  it('RF-102: invalid reminder is rejected before any task is written', async () => {
    const before = await prisma.task.count({ where: { ownerId: owner } });
    await create({ raw_text: 'No crear mañana', reminder_trigger: 'invalid' }).expect(400);
    expect(await prisma.task.count({ where: { ownerId: owner } })).toBe(before);
  });
  it('RF-2301: today-only sessions include planned ranges and expose recurrence without importing overdue tasks', async () => {
    const inbox = await prisma.project.findFirstOrThrow({
      where: { ownerId: owner, isInbox: true },
    });
    const rows = await Promise.all(
      [
        { title: 'Today commitment', dueDate: new Date('2026-10-20T12:00:00Z') },
        {
          title: 'Planned range',
          startDate: new Date('2026-10-19T22:00:00Z'),
          dueDate: new Date('2026-10-23T12:00:00Z'),
        },
        { title: 'Old task', dueDate: new Date('2026-10-19T12:00:00Z') },
        {
          title: 'Repeating today',
          dueDate: new Date('2026-10-20T12:00:00Z'),
          repeatRule: 'RRULE:FREQ=DAILY',
        },
      ].map((data) =>
        prisma.task.create({
          data: { ownerId: owner, createdById: owner, projectId: inbox.id, ...data },
        }),
      ),
    );
    const response = await request(server)
      .post('/api/v1/planning/sessions')
      .set('X-Dev-User-Email', email)
      .send({
        local_date: '2026-10-20',
        time_zone: 'Europe/Madrid',
        today: true,
        overdue: false,
        inbox: false,
        undated: false,
      })
      .expect(201);
    const cards = response.body.cards as {
      task_id: string;
      recurring: boolean | null;
      reason: string;
    }[];
    expect(cards.map((card) => card.task_id)).toEqual(
      expect.arrayContaining([rows[0]?.id, rows[1]?.id, rows[3]?.id]),
    );
    expect(cards.map((card) => card.task_id)).not.toContain(rows[2]?.id);
    expect(cards.find((card) => card.task_id === rows[1]?.id)?.reason).toBe('planned_today');
    expect(cards.find((card) => card.task_id === rows[3]?.id)?.recurring).toBe(true);
  });
});
