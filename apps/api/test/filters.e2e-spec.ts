import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadRootEnv } from '../src/load-env';

loadRootEnv();
process.env.AUTH_MODE = 'dev';

const prisma = new PrismaClient();
const KEYS = [
  'today',
  'tomorrow',
  'next_7_days',
  'all',
  'inbox',
  'assigned_to_me',
  'completed',
  'trash',
  'no_date',
  'recently_added',
];

interface Owner {
  id: string;
  email: string;
}

async function createOwner(name: string): Promise<Owner> {
  const email = `${name}-${randomUUID()}@reflexionia.test`;
  const user = await prisma.user.create({
    data: { email, displayName: name, timeZone: 'Europe/Madrid' },
  });
  return { id: user.id, email };
}

async function removeOwner(id: string): Promise<void> {
  await prisma.checklistItem.deleteMany({ where: { ownerId: id } });
  await prisma.task.deleteMany({ where: { ownerId: id } });
  await prisma.column.deleteMany({ where: { ownerId: id } });
  await prisma.tag.deleteMany({ where: { ownerId: id } });
  await prisma.project.deleteMany({ where: { ownerId: id } });
  await prisma.filter.deleteMany({ where: { ownerId: id } });
  await prisma.smartList.deleteMany({ where: { ownerId: id } });
  await prisma.idempotencyRecord.deleteMany({ where: { ownerId: id } });
  await prisma.outboxEvent.deleteMany({ where: { ownerId: id } });
  await prisma.activityLog.deleteMany({ where: { ownerId: id } });
  await prisma.user.delete({ where: { id } });
}

describe('filters, smart lists and search', () => {
  let app: INestApplication;
  let server: App;
  let owner: Owner;
  let other: Owner;

  beforeAll(async () => {
    await prisma.$connect();
    owner = await createOwner('filters');
    other = await createOwner('filters-other');
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

  it('RF-901 RF-903 RF-1001: provisions smart lists and shows a grouped list view', async () => {
    const api = authed(owner.email);
    const listed = await api.get('/api/v1/smart-lists').expect(200);
    expect(listed.body.items).toHaveLength(10);
    expect(listed.body.items.map((item: { key: string }) => item.key).sort()).toEqual(
      [...KEYS].sort(),
    );

    const inbox = await prisma.project.create({
      data: { ownerId: owner.id, name: 'Bandeja de entrada', isInbox: true },
    });
    const tag = await api.post('/api/v1/tags').send({ name: 'casa' }).expect(201);
    const column = await api
      .post(`/api/v1/projects/${inbox.id}/columns`)
      .send({ name: 'Hoy' })
      .expect(201);
    const due = new Date().toISOString();
    const task = await api
      .post('/api/v1/tasks')
      .send({
        project_id: inbox.id,
        column_id: column.body.id,
        title: 'Leer el informe',
        content: 'capítulo',
        priority: 'high',
        due_date: due,
        time_zone: 'Europe/Madrid',
        tag_ids: [tag.body.id],
      })
      .expect(201);
    await api
      .post(`/api/v1/tasks/${task.body.id}/items`)
      .send({ title: 'anexo secreto' })
      .expect(201);
    await api
      .post('/api/v1/tasks')
      .send({ project_id: inbox.id, title: 'Nota suelta', kind: 'note' })
      .expect(201);

    const today = await api.get('/api/v1/smart-lists/today/tasks?group_by=section').expect(200);
    expect(today.body.count).toBeGreaterThan(0);
    expect(today.body.groups.some((group: { key: string }) => group.key === column.body.id)).toBe(
      true,
    );
    const noteList = await api.get('/api/v1/smart-lists/no_date/tasks').expect(200);
    expect(
      noteList.body.groups.some((group: { tasks: { title: string }[] }) =>
        group.tasks.some((item) => item.title === 'Nota suelta'),
      ),
    ).toBe(true);
    const assigned = await api.get('/api/v1/smart-lists/assigned_to_me/tasks').expect(200);
    expect(assigned.body.count).toBe(0);

    const order = KEYS.filter((key) => key !== 'today').concat('today');
    const updated = await api
      .patch('/api/v1/smart-lists')
      .send({ items: order.map((key) => ({ key, enabled: key !== 'trash' })) })
      .expect(200);
    expect(updated.body.items.at(-1).key).toBe('today');
    expect(updated.body.items.find((item: { key: string }) => item.key === 'trash').enabled).toBe(
      false,
    );
    await api.get('/api/v1/smart-lists/missing/tasks').expect(404);
  });

  it('RF-902 RF-904 RF-903: previews, saves and deletes a filter', async () => {
    const api = authed(owner.email);
    const rules = {
      combinator: 'AND',
      groups: [
        {
          combinator: 'AND',
          conditions: [{ field: 'keyword', op: 'contains', value: 'informe' }],
        },
      ],
    };
    const preview = await api
      .post('/api/v1/filters/preview?group_by=priority&sort=title')
      .send({ mode: 'normal', rules })
      .expect(200);
    expect(preview.body.group_by).toBe('priority');
    expect(
      preview.body.groups.some((group: { tasks: { title: string }[] }) =>
        group.tasks.some((item) => item.title === 'Leer el informe'),
      ),
    ).toBe(true);

    const created = await api
      .post('/api/v1/filters')
      .set('Idempotency-Key', 'filter-informe')
      .send({ name: '  Informes  ', mode: 'normal', rules, color: '#4f46e5' })
      .expect(201);
    expect(created.body.name).toBe('Informes');
    expect(created.body.task_count).toBeGreaterThan(0);
    const replay = await api
      .post('/api/v1/filters')
      .set('Idempotency-Key', 'filter-informe')
      .send({ name: '  Informes  ', mode: 'normal', rules, color: '#4f46e5' })
      .expect(201);
    expect(replay.body.id).toBe(created.body.id);

    const advanced = await api
      .post('/api/v1/filters/preview')
      .send({
        mode: 'advanced',
        rules: {
          combinator: 'OR',
          groups: [
            { combinator: 'AND', conditions: [{ field: 'priority', op: 'gte', value: 'high' }] },
            {
              combinator: 'AND',
              conditions: [{ field: 'status', op: 'eq', value: 'completed' }],
            },
          ],
        },
      })
      .expect(200);
    expect(advanced.body.count).toBeGreaterThan(0);
    await api
      .post('/api/v1/filters')
      .send({
        name: 'Mal',
        mode: 'normal',
        rules: {
          combinator: 'OR',
          groups: [
            { combinator: 'AND', conditions: [] },
            { combinator: 'AND', conditions: [] },
          ],
        },
      })
      .expect(400);

    await api.get(`/api/v1/filters/${created.body.id}/tasks?group_by=tag`).expect(200);
    const pinned = await api
      .patch(`/api/v1/filters/${created.body.id}`)
      .send({ pin: true })
      .expect(200);
    expect(pinned.body.name).toBe('Informes');
    await authed(other.email).get(`/api/v1/filters/${created.body.id}`).expect(404);
    await api.delete(`/api/v1/filters/${created.body.id}`).expect(204);
    await api.get(`/api/v1/filters/${created.body.id}`).expect(404);

    const events = await prisma.outboxEvent.findMany({
      where: {
        ownerId: owner.id,
        type: {
          in: [
            'filter.created@v1',
            'filter.updated@v1',
            'filter.deleted@v1',
            'smart_list.updated@v1',
          ],
        },
      },
    });
    expect(new Set(events.map((event) => event.type))).toEqual(
      new Set([
        'filter.created@v1',
        'filter.updated@v1',
        'filter.deleted@v1',
        'smart_list.updated@v1',
      ]),
    );
  });

  it('RF-1501: searches title, checklist, list and tag names with inline filters', async () => {
    const api = authed(owner.email);
    const found = await api.get('/api/v1/search').query({ q: 'anexo secreto' }).expect(200);
    expect(found.body.groups.some((group: { type: string }) => group.type === 'task')).toBe(true);
    const inline = await api
      .get('/api/v1/search')
      .query({ q: 'informe in:"Bandeja de entrada" #casa priority:high done:false' })
      .expect(200);
    const tasks = inline.body.groups.find((group: { type: string }) => group.type === 'task');
    expect(tasks.items.some((item: { title: string }) => item.title === 'Leer el informe')).toBe(
      true,
    );
    const lists = await api.get('/api/v1/search').query({ q: 'a', types: 'list,tag' }).expect(200);
    expect(lists.body.groups.map((group: { type: string }) => group.type).sort()).toEqual([
      'list',
      'tag',
    ]);
    const notes = await api.get('/api/v1/search').query({ q: 'suelta', types: 'note' }).expect(200);
    expect(notes.body.groups[0].items[0].kind).toBe('note');
    await api.delete(`/api/v1/tasks/${await taskId(api, 'Leer el informe')}`).expect(204);
    const trash = await api.get('/api/v1/smart-lists/trash/tasks').expect(200);
    expect(trash.body.count).toBeGreaterThan(0);
  });
});

async function taskId(api: { get: (url: string) => request.Test }, title: string): Promise<string> {
  const page = await api.get('/api/v1/smart-lists/all/tasks');
  for (const group of page.body.groups as { tasks: { id: string; title: string }[] }[]) {
    const task = group.tasks.find((item) => item.title === title);
    if (task !== undefined) {
      return task.id;
    }
  }
  throw new Error(`missing ${title}`);
}
