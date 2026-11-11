import { nextWorkStart } from '@reflexionia/domain';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';
import { deliverNotification } from '../src/notifications/deliver.js';
import type { ReminderTransport } from '../src/scheduler/reminder.transport.js';

type SuperTestApp = Parameters<typeof request>[0];

loadRootEnv();
process.env.AUTH_MODE = 'dev';
process.env.SCHEDULER_AUTOSTART = 'false';
process.env.ATTACHMENT_DIR = `/tmp/reflexionia-attachments-${randomUUID()}`;

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
  await prisma.notificationReceipt.deleteMany({ where: { ownerId: id } });
  await prisma.notificationAction.deleteMany({ where: { ownerId: id } });
  await prisma.reminderDelivery.deleteMany({ where: { ownerId: id } });
  await prisma.outboxEvent.deleteMany({ where: { ownerId: id } });
  await prisma.activityLog.deleteMany({ where: { ownerId: id } });
  await prisma.taskTag.deleteMany({ where: { task: { ownerId: id } } });
  await prisma.task.deleteMany({ where: { ownerId: id } });
  await prisma.tag.deleteMany({ where: { ownerId: id } });
  await prisma.smartList.deleteMany({ where: { ownerId: id } });
  await prisma.project.deleteMany({ where: { ownerId: id } });
  await prisma.folder.deleteMany({ where: { ownerId: id } });
  await prisma.personalAccessToken.deleteMany({ where: { ownerId: id } });
  await prisma.user.delete({ where: { id } });
}

function weekdayCode(date: Date): string {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
  }).format(date);
  return (
    { Sun: 'SU', Mon: 'MO', Tue: 'TU', Wed: 'WE', Thu: 'TH', Fri: 'FR', Sat: 'SA' }[label] ?? 'SU'
  );
}

describe('work context', () => {
  let app: INestApplication;
  let server: SuperTestApp;
  let owner: Owner;
  let other: Owner;

  beforeAll(async () => {
    await prisma.$connect();
    owner = await createOwner('work');
    other = await createOwner('other');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as SuperTestApp;
  });

  afterAll(async () => {
    await app.close();
    await removeOwner(owner.id);
    await removeOwner(other.id);
    await prisma.$disconnect();
  });

  function authed(email = owner.email) {
    const header = { 'X-Dev-User-Email': email };
    return {
      get: (url: string) => request(server).get(url).set(header),
      post: (url: string) => request(server).post(url).set(header),
      patch: (url: string) => request(server).patch(url).set(header),
      delete: (url: string) => request(server).delete(url).set(header),
    };
  }

  it('defaults to a weekday office and hides nothing until configured', async () => {
    const body = await authed().get('/api/v1/me/work-context').expect(200);
    expect(body.body.work_days).toEqual(['MO', 'TU', 'WE', 'TH', 'FR']);
    expect(body.body.hide_work_outside_hours).toBe(false);
    expect(body.body.work_hidden_now).toBe(false);
    expect(body.body.work_folder_ids).toEqual([]);
    expect(body.body.counts).toEqual({ lists: 0, tags: 0, active_tasks: 0 });
    const me = await authed().get('/api/v1/me').expect(200);
    expect(me.body.work_days).toEqual(['MO', 'TU', 'WE', 'TH', 'FR']);
    expect(me.body.hide_work_outside_hours).toBe(false);
  });

  it('marks work by folder, list or tag, filters auto, and keeps MCP unfiltered', async () => {
    const api = authed();
    const folder = await api.post('/api/v1/folders').send({ name: 'Trabajo' }).expect(201);
    const workList = await api
      .post('/api/v1/projects')
      .send({ name: 'trabajo', folder_id: folder.body.id })
      .expect(201);
    const personal = await api.post('/api/v1/projects').send({ name: 'casa' }).expect(201);
    const tag = await api.post('/api/v1/tags').send({ name: 'curro' }).expect(201);
    const workTask = await api
      .post('/api/v1/tasks')
      .send({ title: 'Informe', project_id: workList.body.id, due_date: new Date().toISOString() })
      .expect(201);
    const tagged = await api
      .post('/api/v1/tasks')
      .send({
        title: 'Extra',
        project_id: personal.body.id,
        tag_ids: [tag.body.id],
        due_date: new Date().toISOString(),
      })
      .expect(201);
    const home = await api
      .post('/api/v1/tasks')
      .send({ title: 'Compra', project_id: personal.body.id, due_date: new Date().toISOString() })
      .expect(201);

    const foreign = await api
      .patch('/api/v1/me/work-context')
      .send({ work_project_ids: [other.inboxId] })
      .expect(422);
    expect(foreign.body.error.code).toBe('validation_failed');

    const saved = await api
      .patch('/api/v1/me/work-context')
      .send({
        work_folder_ids: [folder.body.id],
        work_tag_ids: [tag.body.id],
        hide_work_outside_hours: true,
        work_days: [weekdayCode(new Date()) === 'SU' ? 'MO' : 'SU'],
      })
      .expect(200);
    expect(saved.body.work_hidden_now).toBe(true);
    expect(saved.body.counts.lists).toBeGreaterThanOrEqual(1);
    expect(saved.body.counts.tags).toBe(1);
    expect(saved.body.counts.active_tasks).toBe(2);

    const listed = await api.get('/api/v1/tasks?status=active&flat=true').expect(200);
    const titles = (listed.body.items as { title: string; is_work: boolean }[]).map(
      (item) => item.title,
    );
    expect(titles).toEqual(expect.arrayContaining(['Informe', 'Extra', 'Compra']));
    expect(
      (listed.body.items as { title: string; is_work: boolean }[]).find(
        (item) => item.title === 'Informe',
      )?.is_work,
    ).toBe(true);
    expect(
      (listed.body.items as { title: string; is_work: boolean }[]).find(
        (item) => item.title === 'Compra',
      )?.is_work,
    ).toBe(false);

    const hidden = await api.get('/api/v1/tasks?status=active&flat=true&context=auto').expect(200);
    const hiddenTitles = (hidden.body.items as { title: string }[]).map((item) => item.title);
    expect(hiddenTitles).toContain('Compra');
    expect(hiddenTitles).not.toContain('Informe');
    expect(hiddenTitles).not.toContain('Extra');

    const shown = await api.patch('/api/v1/me/work-context').send({ show_work: true }).expect(200);
    expect(shown.body.show_work_until).not.toBeNull();
    expect(shown.body.work_hidden_now).toBe(false);
    const visible = await api.get('/api/v1/tasks?status=active&flat=true&context=auto').expect(200);
    const visibleTitles = (visible.body.items as { title: string }[]).map((item) => item.title);
    expect(visibleTitles).toEqual(expect.arrayContaining(['Informe', 'Extra', 'Compra']));

    const today = await api.get('/api/v1/smart-lists/today/tasks?context=auto').expect(200);
    const todayIds = today.body.groups.flatMap((group: { tasks: { id: string }[] }) =>
      group.tasks.map((task) => task.id),
    );
    expect(todayIds).toEqual(
      expect.arrayContaining([workTask.body.id, tagged.body.id, home.body.id]),
    );

    const token = await api
      .post('/api/v1/me/tokens')
      .send({ name: 'planner', scopes: ['tasks:read', 'filters:read', 'profile:read'] })
      .expect(201);
    const tools = await request(server)
      .post('/api/v1/mcp')
      .set('Authorization', `Bearer ${token.body.token as string}`)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
      .expect(200);
    const names = (tools.body.result.tools as { name: string }[]).map((tool) => tool.name);
    expect(names).toContain('get_work_context');
    expect(names).not.toContain('update_work_context');

    const mcpTasks = await request(server)
      .post('/api/v1/mcp')
      .set('Authorization', `Bearer ${token.body.token as string}`)
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'list_tasks', arguments: { status: 'active' } },
      })
      .expect(200);
    const page = JSON.parse(mcpTasks.body.result.content[0].text as string) as {
      items: { title: string; is_work: boolean }[];
    };
    expect(page.items.map((item) => item.title)).toEqual(
      expect.arrayContaining(['Informe', 'Extra', 'Compra']),
    );
    expect(page.items.find((item) => item.title === 'Informe')?.is_work).toBe(true);

    await api.patch('/api/v1/me/work-context').send({ show_work: false }).expect(200);
    await api.delete(`/api/v1/tags/${tag.body.id as string}`).expect(204);
    const afterTag = await api.get('/api/v1/me/work-context').expect(200);
    expect(afterTag.body.work_tag_ids).toEqual([]);
    await api.delete(`/api/v1/projects/${workList.body.id as string}`).expect(204);
    await api.delete(`/api/v1/folders/${folder.body.id as string}`).expect(204);
    const afterFolder = await api.get('/api/v1/me/work-context').expect(200);
    expect(afterFolder.body.work_folder_ids).toEqual([]);
  });

  it('delays a work reminder until the next work start', async () => {
    const now = new Date('2026-10-27T20:00:00.000Z');
    await prisma.user.update({
      where: { id: owner.id },
      data: {
        workDays: [1, 2, 3, 4, 5],
        workDayStart: '09:00',
        workDayEnd: '18:00',
        hideWorkOutsideHours: true,
        showWorkUntil: null,
        workProjectIds: [owner.inboxId],
        workFolderIds: [],
        workTagIds: [],
      },
    });
    const task = await prisma.task.create({
      data: {
        ownerId: owner.id,
        projectId: owner.inboxId,
        title: 'Aviso laboral',
        createdById: owner.id,
        dueDate: now,
      },
    });
    const delivery = await prisma.reminderDelivery.create({
      data: {
        ownerId: owner.id,
        taskId: task.id,
        kind: 'task',
        fireAt: now,
        dedupeKey: `work-test-${randomUUID()}`,
        payload: {},
      },
    });
    const transport = {
      deliver: vi.fn().mockResolvedValue({
        email: 'skipped',
        push: 'skipped',
        telegram: 'skipped',
        telegram_message_id: null,
        retry_after_seconds: null,
      }),
    };
    await deliverNotification(
      prisma as never,
      transport as unknown as ReminderTransport,
      {
        id: delivery.id,
        ownerId: owner.id,
        kind: 'task',
        taskId: task.id,
        payload: { notification_channels: ['push'] },
        fireAt: now,
      },
      now,
      { title: 'Aviso laboral', body: '' },
    );
    const expected = nextWorkStart(now.toISOString(), 'Europe/Madrid', {
      start: '09:00',
      end: '18:00',
      days: [1, 2, 3, 4, 5],
    });
    const deferred = await prisma.reminderDelivery.findFirst({
      where: { ownerId: owner.id, dedupeKey: { startsWith: `work:${delivery.id}:push:` } },
    });
    expect(deferred).not.toBeNull();
    if (deferred === null) {
      return;
    }
    expect(deferred.fireAt.toISOString()).toBe(expected);
    const receipt = await prisma.notificationReceipt.findFirst({
      where: { ownerId: owner.id, deliveryId: deferred.id, reason: 'work_hours' },
    });
    expect(receipt?.status).toBe('scheduled');
    expect(transport.deliver).toHaveBeenCalledWith(expect.objectContaining({ allowPush: false }));
  });
});
