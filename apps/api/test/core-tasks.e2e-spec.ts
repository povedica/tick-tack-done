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
process.env.ATTACHMENT_DIR = `/tmp/reflexionia-attachments-${randomUUID()}`;

const prisma = new PrismaClient();

interface Owner {
  id: string;
  email: string;
  inboxId: string;
}

async function createOwner(name: string): Promise<Owner> {
  const email = `${name}-${randomUUID()}@reflexionia.test`;
  const user = await prisma.user.create({ data: { email, displayName: name } });
  const inbox = await prisma.project.create({
    data: { ownerId: user.id, name: 'Bandeja', isInbox: true },
  });
  return { id: user.id, email, inboxId: inbox.id };
}

async function removeOwner(id: string): Promise<void> {
  await prisma.idempotencyRecord.deleteMany({ where: { ownerId: id } });
  await prisma.outboxEvent.deleteMany({ where: { ownerId: id } });
  await prisma.activityLog.deleteMany({ where: { ownerId: id } });
  await prisma.attachment.deleteMany({ where: { ownerId: id } });
  await prisma.checklistItem.deleteMany({ where: { ownerId: id } });
  await prisma.task.updateMany({
    where: { ownerId: id },
    data: { parentId: null, columnId: null },
  });
  await prisma.taskTag.deleteMany({ where: { task: { ownerId: id } } });
  await prisma.task.deleteMany({ where: { ownerId: id } });
  await prisma.column.deleteMany({ where: { ownerId: id } });
  await prisma.project.deleteMany({ where: { ownerId: id } });
  await prisma.folder.deleteMany({ where: { ownerId: id } });
  await prisma.tag.deleteMany({ where: { ownerId: id } });
  await prisma.user.delete({ where: { id } });
}

describe('core tasks API', () => {
  let app: INestApplication;
  let server: App;
  let owner: Owner;
  let other: Owner;

  beforeAll(async () => {
    await prisma.$connect();
    owner = await createOwner('core');
    other = await createOwner('other');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
    await removeOwner(owner.id);
    await removeOwner(other.id);
    await prisma.$disconnect();
  });

  function authed(email: string) {
    const header = { 'X-Dev-User-Email': email };
    return {
      get: (url: string) => request(server).get(url).set(header),
      post: (url: string) => request(server).post(url).set(header),
      patch: (url: string) => request(server).patch(url).set(header),
      delete: (url: string) => request(server).delete(url).set(header),
    };
  }

  it('keeps health public and rejects a scoped call without a dev user', async () => {
    await request(server).get('/api/v1/health').expect(200);
    const response = await request(server).get('/api/v1/projects').expect(401);
    expect(response.body.error.code).toBe('unauthorized');
  });

  it('RF-301 RF-302 RF-303 RF-304 RF-305: lists, folders, sections and the inbox', async () => {
    const api = authed(owner.email);
    await api.delete(`/api/v1/projects/${owner.inboxId}`).expect(409);

    const folder = await api.post('/api/v1/folders').send({ name: 'Casa' }).expect(201);
    const project = await api
      .post('/api/v1/projects')
      .send({ name: 'Compra', color: '#F18181', folder_id: folder.body.id, view_mode: 'list' })
      .expect(201);
    expect(project.body.active_task_count).toBe(0);
    expect(project.body.is_inbox).toBe(false);

    const column = await api
      .post(`/api/v1/projects/${project.body.id}/columns`)
      .send({ name: 'Pendiente' })
      .expect(201);
    const renamed = await api
      .patch(`/api/v1/projects/${project.body.id}/columns/${column.body.id}`)
      .send({ name: 'Hecho', collapsed: true })
      .expect(200);
    expect(renamed.body.collapsed).toBe(true);

    await api.delete(`/api/v1/folders/${folder.body.id}`).expect(204);
    const detached = await api.get(`/api/v1/projects/${project.body.id}`).expect(200);
    expect(detached.body.folder_id).toBeNull();

    const listed = await api.get('/api/v1/projects').expect(200);
    expect(listed.body.items.some((item: { id: string }) => item.id === owner.inboxId)).toBe(true);
    const etag = listed.headers.etag;
    expect(etag).toEqual(expect.any(String));
    await api
      .get('/api/v1/projects')
      .set('If-None-Match', etag ?? '')
      .expect(304);
  });

  it('RF-201 RF-202 RF-205 RF-207 RF-209 RF-501: creates tasks, checklist lines and nested subtasks', async () => {
    const api = authed(owner.email);
    const project = await api.post('/api/v1/projects').send({ name: 'Trabajo' }).expect(201);
    const tag = await api.post('/api/v1/tags').send({ name: 'Casa', color: '#44AAFF' }).expect(201);
    const created = await api
      .post('/api/v1/tasks')
      .send({
        project_id: project.body.id,
        title: 'Preparar la cena',
        content: 'Notas\n- [ ] pan\n- [x] vino',
        extract_checklist: true,
        priority: 'high',
        tag_ids: [tag.body.id],
        time_zone: 'Europe/Madrid',
        start_date: '2026-10-17T18:00:00.000Z',
        due_date: '2026-10-17T19:00:00.000Z',
      })
      .expect(201);
    expect(created.body.priority).toBe('high');
    expect(created.body.duration_minutes).toBe(60);
    expect(created.body.content).toBe('Notas');
    expect(created.body.checklist_progress).toEqual({ completed: 1, total: 2 });
    expect(created.body.tag_ids).toEqual([tag.body.id]);
    expect(
      created.body.activity.some((entry: { action: string }) => entry.action === 'created'),
    ).toBe(true);

    const detail = await api.get(`/api/v1/tasks/${created.body.id}`).expect(200);
    expect(detail.body.items).toHaveLength(2);
    expect(detail.body.activity[0].action).toBe('created');

    const child = await api
      .post('/api/v1/tasks')
      .send({ project_id: owner.inboxId, parent_id: created.body.id, title: 'Poner la mesa' })
      .expect(201);
    expect(child.body.project_id).toBe(owner.inboxId);
    expect(child.body.parent_id).toBe(created.body.id);
    const parent = await api.get(`/api/v1/tasks/${created.body.id}`).expect(200);
    expect(parent.body.subtasks.map((item: { id: string }) => item.id)).toContain(child.body.id);
    const inInbox = await api.get(`/api/v1/tasks?project_id=${owner.inboxId}`).expect(200);
    expect(inInbox.body.items.map((item: { id: string }) => item.id)).toContain(child.body.id);

    const subtask = await api
      .post('/api/v1/tasks')
      .send({ project_id: project.body.id, parent_id: created.body.id, title: 'Poner la mesa' })
      .expect(201);
    const visible = await api.get(`/api/v1/tasks?project_id=${project.body.id}`).expect(200);
    expect(visible.body.items.map((item: { id: string }) => item.id)).not.toContain(
      subtask.body.id,
    );
    const flat = await api.get(`/api/v1/tasks?project_id=${project.body.id}&flat=true`).expect(200);
    expect(flat.body.items.map((item: { id: string }) => item.id)).toContain(subtask.body.id);

    const counted = await api.get(`/api/v1/projects/${project.body.id}`).expect(200);
    expect(counted.body.active_task_count).toBe(1);

    const hidden = await authed(other.email).get(`/api/v1/tasks/${created.body.id}`).expect(404);
    expect(hidden.body.error.code).toBe('task_not_found');
  });

  it('RF-206: asks before completing a parent, then follows the stored policy', async () => {
    const api = authed(owner.email);
    const task = await api
      .post('/api/v1/tasks')
      .send({
        project_id: owner.inboxId,
        title: 'Padre',
        content: '- [ ] hijo',
        extract_checklist: true,
      })
      .expect(201);
    const asked = await api.post(`/api/v1/tasks/${task.body.id}/complete`).send({}).expect(409);
    expect(asked.body.error.code).toBe('children_need_decision');

    await api.patch('/api/v1/me').send({ task_complete_children: 'leave' }).expect(200);
    const left = await api.post(`/api/v1/tasks/${task.body.id}/complete`).send({}).expect(200);
    expect(left.body.status).toBe('completed');
    expect(left.body.checklist_progress).toEqual({ completed: 0, total: 1 });
    await api.patch('/api/v1/me').send({ task_complete_children: 'ask' }).expect(200);
  });

  it('RF-204 RF-208 RF-306 RF-401 RF-403: move, duplicate, batch, trash, tags and archive', async () => {
    const api = authed(owner.email);
    const source = await api.post('/api/v1/projects').send({ name: 'Origen' }).expect(201);
    const target = await api.post('/api/v1/projects').send({ name: 'Destino' }).expect(201);
    const parentTag = await api.post('/api/v1/tags').send({ name: 'Familia' }).expect(201);
    const childTag = await api
      .post('/api/v1/tags')
      .send({ name: 'Hijos', parent_id: parentTag.body.id })
      .expect(201);
    const task = await api
      .post('/api/v1/tasks')
      .send({ project_id: source.body.id, title: 'Moverme', priority: 'low' })
      .expect(201);
    await api
      .post('/api/v1/tasks')
      .send({ project_id: source.body.id, title: 'Etiquetada', tag_ids: [childTag.body.id] })
      .expect(201);

    const byParent = await api.get(`/api/v1/tasks?tag=${parentTag.body.id}&flat=true`).expect(200);
    expect(byParent.body.items).toHaveLength(1);

    const moved = await api
      .post(`/api/v1/tasks/${task.body.id}/move`)
      .send({ project_id: target.body.id })
      .expect(200);
    expect(moved.body.project_id).toBe(target.body.id);

    const copy = await api.post(`/api/v1/tasks/${task.body.id}/duplicate`).expect(201);
    expect(copy.body.id).not.toBe(task.body.id);
    expect(copy.body.title).toBe('Moverme');

    const note = await api
      .patch(`/api/v1/tasks/${task.body.id}`)
      .send({ kind: 'note' })
      .expect(200);
    expect(note.body.kind).toBe('note');

    await api
      .post('/api/v1/tasks/batch')
      .send({ action: 'priority', ids: [copy.body.id], priority: 'high' })
      .expect(200);
    const prioritized = await api.get(`/api/v1/tasks/${copy.body.id}`).expect(200);
    expect(prioritized.body.priority).toBe('high');

    await api.post(`/api/v1/tasks/${copy.body.id}/complete`).send({}).expect(200);
    await api.post(`/api/v1/projects/${target.body.id}/archive-completed`).expect(200);
    const archived = await api.get(`/api/v1/tasks/${copy.body.id}`).expect(200);
    expect(archived.body.status).toBe('archived');

    await api.delete(`/api/v1/tasks/${task.body.id}`).expect(204);
    const trashed = await api.get('/api/v1/tasks/trash').expect(200);
    expect(trashed.body.items.some((item: { id: string }) => item.id === task.body.id)).toBe(true);
    await api.post(`/api/v1/tasks/trash/${task.body.id}/restore`).expect(200);

    const renamed = await api
      .patch(`/api/v1/tags/${childTag.body.id}`)
      .send({ name: 'Pequeños' })
      .expect(200);
    expect(renamed.body.id).toBe(childTag.body.id);
    const merged = await api
      .post('/api/v1/tags/merge')
      .send({ source_id: childTag.body.id, target_id: parentTag.body.id })
      .expect(200);
    expect(merged.body.id).toBe(parentTag.body.id);

    await api.delete(`/api/v1/tasks/${task.body.id}`).expect(204);
    const emptied = await api.delete('/api/v1/tasks/trash').expect(200);
    expect(emptied.body.deleted).toBeGreaterThan(0);
    const stillThere = await prisma.task.findUnique({ where: { id: task.body.id } });
    expect(stillThere).toBeNull();
  });

  it('replays a create when the Idempotency-Key is repeated', async () => {
    const api = authed(owner.email);
    const key = randomUUID();
    const first = await api
      .post('/api/v1/tasks')
      .set('Idempotency-Key', key)
      .send({ project_id: owner.inboxId, title: 'Una vez' })
      .expect(201);
    const second = await api
      .post('/api/v1/tasks')
      .set('Idempotency-Key', key)
      .send({ project_id: owner.inboxId, title: 'Una vez' })
      .expect(201);
    expect(second.body.id).toBe(first.body.id);
    const conflict = await api
      .post('/api/v1/tasks')
      .set('Idempotency-Key', key)
      .send({ project_id: owner.inboxId, title: 'Otra' })
      .expect(409);
    expect(conflict.body.error.code).toBe('idempotency_conflict');

    const events = await prisma.outboxEvent.findMany({
      where: { ownerId: owner.id, type: 'task.created@v1' },
    });
    expect(events.length).toBeGreaterThan(0);
  });

  it('keeps an explicit title, including empty and edge spaces', async () => {
    const api = authed(owner.email);
    const empty = await api
      .post('/api/v1/tasks')
      .send({ project_id: owner.inboxId, title: '', priority: 'none', time_zone: 'Europe/Madrid' })
      .expect(201);
    const emptyGet = await api.get(`/api/v1/tasks/${empty.body.id}`).expect(200);
    expect(emptyGet.body.title).toBe('');

    const spaced = ' lista de compra ';
    const created = await api
      .post('/api/v1/tasks')
      .send({ project_id: owner.inboxId, title: spaced, time_zone: 'Europe/Madrid' })
      .expect(201);
    const loaded = await api.get(`/api/v1/tasks/${created.body.id}`).expect(200);
    expect(loaded.body.title).toBe(spaced);
  });

  it('stores repeat_rule exactly as sent', async () => {
    const api = authed(owner.email);
    const rule = 'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO';
    const created = await api
      .post('/api/v1/tasks')
      .send({
        project_id: owner.inboxId,
        title: 'Asistenta lunes',
        priority: 'high',
        due_date: '2026-05-04T11:10:00.000Z',
        start_date: '2026-05-04T11:10:00.000Z',
        time_zone: 'Europe/Madrid',
        repeat_rule: rule,
      })
      .expect(201);
    expect(created.body.repeat_rule).toBe(rule);
    const loaded = await api.get(`/api/v1/tasks/${created.body.id}`).expect(200);
    expect(loaded.body.repeat_rule).toBe(rule);
  });

  it('RF-203: stores an attachment and downloads it as a file', async () => {
    const api = authed(owner.email);
    const task = await api
      .post('/api/v1/tasks')
      .send({ project_id: owner.inboxId, title: 'Con adjunto' })
      .expect(201);
    const uploaded = await api
      .post(`/api/v1/tasks/${task.body.id}/attachments`)
      .attach('file', Buffer.from('hola'), { filename: 'nota.txt', contentType: 'text/plain' })
      .expect(201);
    const downloaded = await api
      .get(`/api/v1/tasks/${task.body.id}/attachments/${uploaded.body.id}`)
      .expect(200);
    expect(downloaded.text).toBe('hola');
    expect(downloaded.headers['content-disposition']).toContain('nota.txt');
  });

  it('RF-502: sorts high priority ahead of none', async () => {
    const api = authed(owner.email);
    const project = await api.post('/api/v1/projects').send({ name: 'Orden' }).expect(201);
    await api
      .post('/api/v1/tasks')
      .send({ project_id: project.body.id, title: 'Baja', priority: 'none' })
      .expect(201);
    await api
      .post('/api/v1/tasks')
      .send({ project_id: project.body.id, title: 'Alta', priority: 'high' })
      .expect(201);
    const page = await api
      .get(`/api/v1/tasks?project_id=${project.body.id}&sort=priority`)
      .expect(200);
    expect(page.body.items[0].title).toBe('Alta');
    expect(page.body.items[1].title).toBe('Baja');
  });
});
