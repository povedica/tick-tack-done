import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { civilDateKey, instantFromWall, shiftCivilDate } from '@reflexionia/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';

type SuperTestApp = Parameters<typeof request>[0];

loadRootEnv();
process.env.AUTH_MODE = 'dev';
process.env.ATTACHMENT_DIR = `/tmp/reflexionia-attachments-${randomUUID()}`;

const prisma = new PrismaClient();
const ZONE = 'Europe/Madrid';

interface Owner {
  id: string;
  email: string;
  inboxId: string;
}

function wall(day: string, hour = 0, minute = 0): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (match === null) {
    throw new Error(day);
  }
  const iso = instantFromWall(
    {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour,
      minute,
      second: 0,
    },
    ZONE,
  );
  if (iso === null) {
    throw new Error(day);
  }
  return iso;
}

function taskIds(body: {
  readonly groups?: readonly { readonly tasks?: readonly { readonly id: string }[] }[];
  readonly items?: readonly { readonly id: string }[];
}): string[] {
  return [
    ...(body.groups ?? []).flatMap((group) => (group.tasks ?? []).map((task) => task.id)),
    ...(body.items ?? []).map((task) => task.id),
  ];
}

describe('planned tasks are not overdue', () => {
  let app: INestApplication;
  let server: SuperTestApp;
  let owner: Owner;
  const today = civilDateKey(new Date().toISOString(), ZONE);
  if (today === null) {
    throw new Error('zone');
  }
  const past = shiftCivilDate(today, -2);
  const tomorrow = shiftCivilDate(today, 1);
  const later = shiftCivilDate(today, 2);
  const kept = shiftCivilDate(today, 9);

  beforeAll(async () => {
    await prisma.$connect();
    const email = `planned-${randomUUID()}@reflexionia.test`;
    const user = await prisma.user.create({
      data: { email, displayName: 'Planned', timeZone: ZONE },
    });
    const inbox = await prisma.project.create({
      data: { ownerId: user.id, name: 'Bandeja', isInbox: true },
    });
    owner = { id: user.id, email, inboxId: inbox.id };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as SuperTestApp;
  });

  afterAll(async () => {
    await app.close();
    await prisma.planOperation.deleteMany({ where: { ownerId: owner.id } });
    await prisma.planDecision.deleteMany({ where: { session: { ownerId: owner.id } } });
    await prisma.planMember.deleteMany({ where: { plan: { ownerId: owner.id } } });
    await prisma.planSession.deleteMany({ where: { ownerId: owner.id } });
    await prisma.dayPlan.deleteMany({ where: { ownerId: owner.id } });
    await prisma.activityLog.deleteMany({ where: { ownerId: owner.id } });
    await prisma.personalAccessToken.deleteMany({ where: { ownerId: owner.id } });
    await prisma.idempotencyRecord.deleteMany({ where: { ownerId: owner.id } });
    await prisma.outboxEvent.deleteMany({ where: { ownerId: owner.id } });
    await prisma.smartList.deleteMany({ where: { ownerId: owner.id } });
    await prisma.task.updateMany({ where: { ownerId: owner.id }, data: { parentId: null } });
    await prisma.task.deleteMany({ where: { ownerId: owner.id } });
    await prisma.project.deleteMany({ where: { ownerId: owner.id } });
    await prisma.user.delete({ where: { id: owner.id } });
    await prisma.$disconnect();
  });

  function api() {
    const header = { 'X-Dev-User-Email': owner.email };
    return {
      get: (url: string) => request(server).get(url).set(header),
      post: (url: string) => request(server).post(url).set(header),
      patch: (url: string) => request(server).patch(url).set(header),
    };
  }

  async function createTask(title: string, body: Record<string, unknown>) {
    return api()
      .post('/api/v1/tasks')
      .set('Idempotency-Key', randomUUID())
      .send({ project_id: owner.inboxId, title, time_zone: ZONE, ...body })
      .expect(201);
  }

  it('moves a past deadline onto a later plan and keeps a deadline that is still ahead', async () => {
    const allDay = await createTask('Plan all day', {
      due_date: past,
      is_all_day: true,
      duration_minutes: 45,
    });
    const timed = await createTask('Plan timed', { due_date: past, is_all_day: true });
    const keep = await createTask('Keep deadline', {
      start_date: today,
      due_date: kept,
      is_all_day: true,
    });
    const session = await api()
      .post('/api/v1/planning/sessions')
      .send({ local_date: today, time_zone: ZONE })
      .expect(201);
    const schedule = (id: string, body: Record<string, unknown>) =>
      api()
        .post(`/api/v1/planning/sessions/${String(session.body.id)}/schedule/${id}`)
        .set('Idempotency-Key', randomUUID())
        .send(body);

    await schedule(String(allDay.body.id), { action: 'move', date: later }).expect(200);
    await schedule(String(timed.body.id), {
      action: 'move',
      date: later,
      time: '10:00',
      duration: 30,
    }).expect(200);
    await schedule(String(keep.body.id), { action: 'move', date: tomorrow }).expect(200);

    const moved = await api()
      .get(`/api/v1/tasks/${String(allDay.body.id)}`)
      .expect(200);
    expect(moved.body.start_date).toBe(wall(later));
    expect(moved.body.due_date).toBe(wall(later));
    expect(moved.body.is_all_day).toBe(true);
    expect(moved.body.duration_minutes).toBe(45);

    const clocked = await api()
      .get(`/api/v1/tasks/${String(timed.body.id)}`)
      .expect(200);
    expect(clocked.body.start_date).toBe(wall(later, 10, 0));
    expect(clocked.body.due_date).toBe(wall(later, 10, 30));
    expect(clocked.body.duration_minutes).toBe(30);
    expect(clocked.body.is_all_day).toBe(false);

    const unchanged = await api()
      .get(`/api/v1/tasks/${String(keep.body.id)}`)
      .expect(200);
    expect(unchanged.body.start_date).toBe(wall(tomorrow));
    expect(unchanged.body.due_date).toBe(wall(kept));
  });

  it('hides a future start from today, the overdue badge, review and the garden', async () => {
    const planned = await prisma.task.create({
      data: {
        ownerId: owner.id,
        createdById: owner.id,
        projectId: owner.inboxId,
        title: 'Already planned',
        startDate: new Date(wall(later)),
        dueDate: new Date(wall(past)),
        isAllDay: true,
        timeZone: ZONE,
      },
    });
    const started = await prisma.task.create({
      data: {
        ownerId: owner.id,
        createdById: owner.id,
        projectId: owner.inboxId,
        title: 'Started today',
        startDate: new Date(wall(today)),
        dueDate: new Date(wall(past)),
        isAllDay: true,
        timeZone: ZONE,
      },
    });

    const todayList = await api().get('/api/v1/smart-lists/today/tasks?limit=100').expect(200);
    const overdue = await api()
      .get('/api/v1/tasks?status=active&overdue=true&flat=true&limit=100')
      .expect(200);
    const review = await api().get('/api/v1/review/weekly').expect(200);
    const dashboard = await api().get('/api/v1/dashboard/data').expect(200);
    const todayIds = taskIds(todayList.body as { groups?: { tasks?: { id: string }[] }[] });
    const overdueIds = (overdue.body.items as { id: string }[]).map((item) => item.id);
    const reviewIds = review.body.overdue_ids as string[];
    const byList = dashboard.body.widgets.overdue_by_list as { total: number }[];

    expect(todayIds).not.toContain(planned.id);
    expect(overdueIds).not.toContain(planned.id);
    expect(reviewIds).not.toContain(planned.id);
    expect(todayIds).toContain(started.id);
    expect(overdueIds).toContain(started.id);
    expect(reviewIds).toContain(started.id);
    expect(dashboard.body.widgets.overdue).toBe(overdueIds.length);
    expect(byList.reduce((sum, row) => sum + row.total, 0)).toBe(overdueIds.length);

    const token = await api()
      .post('/api/v1/me/tokens')
      .send({
        name: `planned ${randomUUID()}`,
        scopes: ['tasks:read', 'tasks:write', 'filters:read'],
      })
      .expect(201);
    const call = (name: string, args: Record<string, unknown>) =>
      request(server)
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${String(token.body.token)}`)
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
    const listed = await call('list_tasks', { overdue: true, limit: 100 });
    const smart = await call('list_smart_list_tasks', { key: 'today', limit: 100 });
    expect(listed.body.result.isError).toBe(false);
    expect(smart.body.result.isError).toBe(false);
    const listedIds = taskIds(
      JSON.parse(String(listed.body.result.content[0].text)) as {
        items?: { id: string }[];
      },
    );
    const smartIds = taskIds(
      JSON.parse(String(smart.body.result.content[0].text)) as {
        groups?: { tasks?: { id: string }[] }[];
      },
    );
    expect(listedIds).not.toContain(planned.id);
    expect(listedIds).toContain(started.id);
    expect(smartIds).not.toContain(planned.id);
    expect(smartIds).toContain(started.id);
  });

  it('rejects a start after the deadline outside planning, in the API and the MCP', async () => {
    const created = await createTask('Reject start', { due_date: past, is_all_day: true });
    const rejected = await api()
      .patch(`/api/v1/tasks/${String(created.body.id)}`)
      .send({ start_date: later });
    expect(rejected.status).toBe(422);
    expect(rejected.body.error.code).toBe('deadline_before_when');

    const token = await api()
      .post('/api/v1/me/tokens')
      .send({ name: `reject ${randomUUID()}`, scopes: ['tasks:write'] })
      .expect(201);
    const mcp = await request(server)
      .post('/api/v1/mcp')
      .set('Authorization', `Bearer ${String(token.body.token)}`)
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'update_task',
          arguments: { id: created.body.id, start_date: later },
        },
      });
    expect(mcp.body.result.isError).toBe(true);
    expect(String(mcp.body.result.content[0].text)).toContain('deadline_before_when');
    const saved = await prisma.task.findUniqueOrThrow({ where: { id: String(created.body.id) } });
    expect(saved.startDate).toBeNull();
  });
});
