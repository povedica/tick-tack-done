import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadRootEnv } from '../src/load-env';

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
  let server: App;
  let owner: Owner;

  beforeAll(async () => {
    await prisma.$connect();
    owner = await createOwner('capture');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as App;
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
      expect.objectContaining({ trigger: 'TRIGGER:-PT30M', type: 'relative' }),
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

  it('RF-107: an empty title creates nothing and a missing list stays in the inbox', async () => {
    const api = authed();
    const before = await prisma.task.count({ where: { ownerId: owner.id } });
    const listsBefore = await prisma.project.count({ where: { ownerId: owner.id } });
    const empty = await api.post('/api/v1/tasks').send({ raw_text: 'mañana 18:00' }).expect(400);
    expect(empty.body.error.code).toBe('empty_title');
    expect(await prisma.task.count({ where: { ownerId: owner.id } })).toBe(before);

    const missing = await api
      .post('/api/v1/tasks')
      .send({ raw_text: 'llamar ^noexiste #fantasma' })
      .expect(201);
    expect(missing.body.project_id).toBe(owner.inboxId);
    expect(missing.body.title).toBe('llamar');
    expect(missing.body.tag_ids).toEqual([]);
    expect(missing.body.warnings).toEqual([
      { code: 'list_not_found', name: 'noexiste' },
      { code: 'tag_not_found', name: 'fantasma' },
    ]);
    expect(await prisma.project.count({ where: { ownerId: owner.id } })).toBe(listsBefore);
    expect(await prisma.tag.count({ where: { ownerId: owner.id, name: 'fantasma' } })).toBe(0);
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
});
