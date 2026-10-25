import { captureSettings } from '@reflexionia/domain';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as linkTitles from '../src/modules/tasks/link-title.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';

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
  await prisma.reminderDelivery.deleteMany({ where: { ownerId: id } });
  await prisma.reminder.deleteMany({ where: { ownerId: id } });
  await prisma.idempotencyRecord.deleteMany({ where: { ownerId: id } });
  await prisma.outboxEvent.deleteMany({ where: { ownerId: id } });
  await prisma.activityLog.deleteMany({ where: { ownerId: id } });
  await prisma.taskTag.deleteMany({ where: { task: { ownerId: id } } });
  await prisma.task.deleteMany({ where: { ownerId: id } });
  await prisma.tag.deleteMany({ where: { ownerId: id } });
  await prisma.project.deleteMany({ where: { ownerId: id } });
  await prisma.user.delete({ where: { id } });
}

describe('capture API', () => {
  let app: INestApplication;
  let server: SuperTestApp;
  let owner: Owner;

  beforeAll(async () => {
    await prisma.$connect();
    owner = await createOwner('capture');
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
  });

  function authed() {
    const header = { 'X-Dev-User-Email': owner.email };
    return {
      get: (url: string) => request(server).get(url).set(header),
      post: (url: string) => request(server).post(url).set(header),
    };
  }

  it('RF-102: raw_text is parsed on the server and explicit fields override it', async () => {
    const api = authed();
    const list = await api.post('/api/v1/projects').send({ name: 'Trabajo' }).expect(201);
    const tag = await api.post('/api/v1/tags').send({ name: 'Casa' }).expect(201);
    const created = await api
      .post('/api/v1/tasks')
      .send({
        raw_text: 'comprar leche el 23/10/2028 18:00 #casa !baja ^trabajo avísame 30 min antes',
      })
      .expect(201);
    expect(created.body.title).toBe('comprar leche');
    expect(created.body.project_id).toBe(list.body.id);
    expect(created.body.priority).toBe('low');
    expect(created.body.tag_ids).toEqual([tag.body.id]);
    // 23 Oct 2028 18:00 in Madrid is still CEST (UTC+2).
    expect(created.body.due_date).toBe('2028-10-23T16:00:00.000Z');
    expect(created.body.is_all_day).toBe(false);
    expect(created.body.warnings).toBeUndefined();

    const reminders = await api.get(`/api/v1/tasks/${created.body.id}/reminders`).expect(200);
    expect(reminders.body).toEqual([
      expect.objectContaining({ trigger: '-PT30M', type: 'relative' }),
    ]);
    const event = await prisma.outboxEvent.findFirst({
      where: {
        ownerId: owner.id,
        type: 'task.created@v1',
        data: { path: ['task', 'id'], equals: created.body.id },
      },
    });
    expect(event?.publishedAt).toBeNull();

    const overridden = await api
      .post('/api/v1/tasks')
      .send({
        raw_text: 'borrar el 23/10/2028 !alta ^trabajo',
        title: 'Quedarme el título',
        priority: 'high',
        project_id: owner.inboxId,
      })
      .expect(201);
    expect(overridden.body.title).toBe('Quedarme el título');
    expect(overridden.body.priority).toBe('high');
    expect(overridden.body.project_id).toBe(owner.inboxId);

    const weekly = await api.post('/api/v1/tasks').send({ raw_text: 'gym cada lunes' }).expect(201);
    expect(weekly.body.repeat_rule).toContain('FREQ=WEEKLY');
    expect(weekly.body.repeat_rule).toContain('BYDAY=MO');
    expect(weekly.body.project_id).toBe(owner.inboxId);
  });

  it('RF-107: an empty title creates nothing; a new list and tag are created with the task', async () => {
    const api = authed();
    const before = await prisma.task.count({ where: { ownerId: owner.id } });
    const listsBefore = await prisma.project.count({ where: { ownerId: owner.id } });
    const tagsBefore = await prisma.tag.count({ where: { ownerId: owner.id } });
    const empty = await api.post('/api/v1/tasks').send({ raw_text: 'mañana 18:00' }).expect(400);
    expect(empty.body.error.code).toBe('empty_title');
    expect(await prisma.task.count({ where: { ownerId: owner.id } })).toBe(before);
    expect(await prisma.project.count({ where: { ownerId: owner.id } })).toBe(listsBefore);
    expect(await prisma.tag.count({ where: { ownerId: owner.id } })).toBe(tagsBefore);

    const missing = await api
      .post('/api/v1/tasks')
      .send({ raw_text: 'llamar ^noexiste #fantasma' })
      .expect(201);
    expect(missing.body.title).toBe('llamar');
    expect(missing.body.project_id).not.toBe(owner.inboxId);
    const project = await prisma.project.findFirst({
      where: { ownerId: owner.id, name: 'noexiste', deletedAt: null },
    });
    expect(project).not.toBeNull();
    if (project === null) {
      return;
    }
    expect(project.id).toBe(missing.body.project_id);
    const tag = await prisma.tag.findFirst({
      where: { ownerId: owner.id, name: 'fantasma', deletedAt: null },
    });
    expect(tag).not.toBeNull();
    expect(missing.body.tag_ids).toEqual([tag?.id]);
    expect(missing.body.warnings).toEqual([
      { code: 'list_created', name: 'noexiste' },
      { code: 'tag_created', name: 'fantasma' },
    ]);
    const createdList = await prisma.outboxEvent.findFirst({
      where: {
        ownerId: owner.id,
        type: 'project.created@v1',
        data: { path: ['project', 'id'], equals: project.id },
      },
    });
    expect(createdList).not.toBeNull();

    const again = await api.post('/api/v1/tasks').send({ raw_text: 'otra ^noexiste' }).expect(201);
    expect(again.body.project_id).toBe(project.id);
    expect(again.body.warnings ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'list_created' })]),
    );
    expect(
      await prisma.project.count({
        where: { ownerId: owner.id, name: 'noexiste', deletedAt: null },
      }),
    ).toBe(1);

    const cased = await api
      .post('/api/v1/tasks')
      .send({ raw_text: 'tercera ^NOEXISTE' })
      .expect(201);
    expect(cased.body.project_id).toBe(project.id);
    expect(cased.body.warnings ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'list_created' })]),
    );

    const reused = await api
      .post('/api/v1/tasks')
      .send({ raw_text: 'cuarta #fantasma' })
      .expect(201);
    expect(reused.body.tag_ids).toEqual([tag?.id]);
    expect(reused.body.warnings ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'tag_created' })]),
    );
    expect(await prisma.tag.count({ where: { ownerId: owner.id, name: 'fantasma' } })).toBe(1);

    const pinned = await api
      .post('/api/v1/tasks')
      .send({ raw_text: 'quinta ^otra', project_id: owner.inboxId })
      .expect(201);
    expect(pinned.body.project_id).toBe(owner.inboxId);
    expect(
      await prisma.project.count({ where: { ownerId: owner.id, name: 'otra', deletedAt: null } }),
    ).toBe(0);

    const explicitTags = await api
      .post('/api/v1/tasks')
      .send({ raw_text: 'sexta #nuevaetiqueta', tag_ids: [], project_id: owner.inboxId })
      .expect(201);
    expect(explicitTags.body.tag_ids).toEqual([]);
    expect(await prisma.tag.count({ where: { ownerId: owner.id, name: 'nuevaetiqueta' } })).toBe(0);
  });

  it('RF-102: the same idempotency key replays one parsed task', async () => {
    const api = authed();
    const key = randomUUID();
    const first = await api
      .post('/api/v1/tasks')
      .set('Idempotency-Key', key)
      .send({ raw_text: 'una sola captura' })
      .expect(201);
    const second = await api
      .post('/api/v1/tasks')
      .set('Idempotency-Key', key)
      .send({ raw_text: 'una sola captura' })
      .expect(201);
    expect(second.body.id).toBe(first.body.id);
    expect(
      await prisma.task.count({ where: { ownerId: owner.id, title: 'una sola captura' } }),
    ).toBe(1);
  });

  it('rejects a task that has neither a title nor raw_text', async () => {
    const api = authed();
    const missing = await api.post('/api/v1/tasks').send({ project_id: owner.inboxId }).expect(400);
    expect(missing.body.error.code).toBe('validation_failed');
  });
  it('RF-102: owner capture defaults persist, validate references and yield to explicit fields', async () => {
    const api = authed();
    const defaults = captureSettings(null);
    const list = await api.post('/api/v1/projects').send({ name: 'Capturas' }).expect(201);
    const tag = await api.post('/api/v1/tags').send({ name: 'capturada' }).expect(201);
    const settings = {
      ...defaults,
      recognize_dates: false,
      recognize_tags: false,
      default_priority: 'high',
      default_list_id: list.body.id,
      default_tag_id: tag.body.id,
      default_date: 'tomorrow',
      default_date_mode: 'date_time',
      default_time: '09:00',
      default_duration_minutes: 60,
      timed_reminder: '-PT5M',
      new_task_position: 'top',
    };
    const patch = (body: object) =>
      request(server).patch('/api/v1/me').set('X-Dev-User-Email', owner.email).send(body);
    const other = await createOwner('other-capture');
    try {
      await patch({ capture_settings: { ...settings, default_time: '25:00' } }).expect(400);
      await patch({ capture_settings: { ...settings, default_list_id: randomUUID() } }).expect(400);
      await patch({ capture_settings: { ...settings, default_list_id: other.inboxId } }).expect(
        400,
      );
      await patch({ capture_settings: settings }).expect(200);
      expect((await api.get('/api/v1/me')).body.capture_settings).toEqual(settings);
      const first = await api
        .post('/api/v1/tasks')
        .send({ raw_text: 'Revisar mañana #literal' })
        .expect(201);
      expect(first.body).toMatchObject({
        title: 'Revisar mañana #literal',
        project_id: list.body.id,
        tag_ids: [tag.body.id],
        priority: 'high',
        duration_minutes: 60,
        is_all_day: false,
      });
      expect(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/Madrid',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(String(first.body.due_date))),
      ).toBe('09:00');
      const reminders = await api.get(`/api/v1/tasks/${first.body.id}/reminders`).expect(200);
      expect(reminders.body).toEqual([expect.objectContaining({ trigger: '-PT5M' })]);
      const second = await api
        .post('/api/v1/tasks')
        .send({ title: 'Segunda', project_id: list.body.id })
        .expect(201);
      expect(BigInt(String(second.body.sort_order))).toBeLessThan(
        BigInt(String(first.body.sort_order)),
      );
      const explicit = await api
        .post('/api/v1/tasks')
        .send({
          raw_text: 'Otra mañana #literal',
          title: 'Manual',
          project_id: owner.inboxId,
          tag_ids: [],
          priority: 'none',
          due_date: null,
          duration_minutes: null,
          reminder_trigger: null,
          move_to_end: true,
        })
        .expect(201);
      expect(explicit.body).toMatchObject({
        title: 'Manual',
        project_id: owner.inboxId,
        tag_ids: [],
        priority: 'none',
        due_date: null,
        duration_minutes: null,
      });
      expect(await prisma.tag.count({ where: { ownerId: owner.id, name: 'literal' } })).toBe(0);
      expect(
        await prisma.outboxEvent.count({
          where: { ownerId: owner.id, type: 'capture.settings_updated@v1' },
        }),
      ).toBeGreaterThan(0);
    } finally {
      await prisma.user.update({ where: { id: owner.id }, data: { captureSettings: {} } });
      await removeOwner(other.id);
    }
  });
  it('RF-102: URL title lookup is opt-in and retains the original link', async () => {
    const title = vi.spyOn(linkTitles, 'linkTitle').mockResolvedValue('Página de prueba');
    const api = authed();
    try {
      const off = await api
        .post('/api/v1/tasks')
        .send({ raw_text: 'https://example.test/capture-off' })
        .expect(201);
      expect(off.body.title).toBe('https://example.test/capture-off');
      expect(title).not.toHaveBeenCalled();
      await prisma.user.update({
        where: { id: owner.id },
        data: { captureSettings: { ...captureSettings(null), parse_url_title: true } },
      });
      const on = await api
        .post('/api/v1/tasks')
        .send({ raw_text: 'https://example.test/capture-on' })
        .expect(201);
      expect(on.body.title).toBe('Página de prueba');
      expect(on.body.content).toContain('https://example.test/capture-on');
      expect(title).toHaveBeenCalledWith('https://example.test/capture-on');
      expect(
        await prisma.taskLink.count({
          where: { taskId: String(on.body.id), url: 'https://example.test/capture-on' },
        }),
      ).toBe(1);
    } finally {
      title.mockRestore();
      await prisma.user.update({ where: { id: owner.id }, data: { captureSettings: {} } });
    }
  });
});
