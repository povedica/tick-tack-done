import { shiftLocalDays } from '@reflexionia/domain';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { EventRouter } from '../src/events/event-router.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

type SuperTestApp = Parameters<typeof request>[0];

loadRootEnv();
process.env.AUTH_MODE = 'dev';
process.env.PRISMA_QUERY_EVENTS = '1';

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
  'someday',
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
  await prisma.folder.deleteMany({ where: { ownerId: id } });
  await prisma.filter.deleteMany({ where: { ownerId: id } });
  await prisma.smartList.deleteMany({ where: { ownerId: id } });
  await prisma.idempotencyRecord.deleteMany({ where: { ownerId: id } });
  await prisma.outboxEvent.deleteMany({ where: { ownerId: id } });
  await prisma.activityLog.deleteMany({ where: { ownerId: id } });
  await prisma.personalAccessToken.deleteMany({ where: { ownerId: id } });
  await prisma.user.delete({ where: { id } });
}

describe('filters, smart lists and search', () => {
  let app: INestApplication;
  let server: SuperTestApp;
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
    server = app.getHttpServer() as SuperTestApp;
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
    expect(listed.body.items).toHaveLength(11);
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
    const sample = today.body.groups[0].tasks[0] as { completed_at: unknown; source: unknown };
    expect(sample.completed_at).toBeNull();
    expect(sample.source).toBe('manual');
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

  it('TTD-AUD-01 RF-601 RF-904: start-only tomorrow task appears in the list and sidebar count', async () => {
    const user = await createOwner('effective-date');
    try {
      const api = authed(user.email);
      const project = await prisma.project.create({
        data: { ownerId: user.id, name: 'Inbox', isInbox: true },
      });
      const start = shiftLocalDays(new Date().toISOString(), 'Europe/Madrid', 1);
      const task = await api
        .post('/api/v1/tasks')
        .send({
          project_id: project.id,
          title: 'Start only',
          start_date: start,
          due_date: null,
          is_all_day: false,
          duration_minutes: 30,
          time_zone: 'Europe/Madrid',
        })
        .expect(201);
      const page = await api.get('/api/v1/smart-lists/tomorrow/tasks').expect(200);
      expect(page.body.count).toBe(1);
      expect(page.body.groups.flatMap((group: { tasks: unknown[] }) => group.tasks)).toEqual([
        expect.objectContaining({
          id: task.body.id,
          start_date: start,
          due_date: null,
          duration_minutes: 30,
        }),
      ]);
      const lists = await api.get('/api/v1/smart-lists').expect(200);
      expect(
        lists.body.items.find((item: { key: string }) => item.key === 'tomorrow').task_count,
      ).toBe(1);
      const undated = await api.get('/api/v1/smart-lists/no_date/tasks').expect(200);
      expect(undated.body.count).toBe(0);
    } finally {
      await removeOwner(user.id);
    }
  });

  it('RF-901: fixed navigation survives legacy hidden flags and cannot be hidden by updates', async () => {
    const api = authed(owner.email);
    await prisma.smartList.updateMany({
      where: { ownerId: owner.id, key: 'today' },
      data: { enabled: false },
    });
    const listed = await api.get('/api/v1/smart-lists').expect(200);
    expect(listed.body.items.find((item: { key: string }) => item.key === 'today').enabled).toBe(
      true,
    );
    const updated = await api
      .patch('/api/v1/smart-lists')
      .send({
        items: listed.body.items.map((item: { key: string }) => ({
          key: item.key,
          enabled: false,
        })),
      })
      .expect(200);
    for (const key of [
      'today',
      'tomorrow',
      'next_7_days',
      'all',
      'inbox',
      'no_date',
      'recently_added',
      'someday',
    ])
      expect(updated.body.items.find((item: { key: string }) => item.key === key).enabled).toBe(
        true,
      );
    expect(
      updated.body.items.find((item: { key: string }) => item.key === 'assigned_to_me').enabled,
    ).toBe(false);
    expect(
      await prisma.smartList.findFirst({ where: { ownerId: owner.id, key: 'today' } }),
    ).toMatchObject({ enabled: true });
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

  it('GET /smart-lists answers in under 300ms with 1000 tasks and matches each list count', async () => {
    const user = await createOwner('perf');
    const project = await prisma.project.create({
      data: { ownerId: user.id, name: 'Inbox', isInbox: true },
    });
    const now = new Date();
    await prisma.task.createMany({
      data: Array.from({ length: 1000 }, (_, index) => ({
        ownerId: user.id,
        projectId: project.id,
        createdById: user.id,
        title: `Perf ${index}`,
        status: index % 4 === 0 ? 'completed' : 'active',
        dueDate: new Date(now.getTime() - (index % 20) * 86_400_000),
        completedAt: index % 4 === 0 ? now : null,
      })),
    });
    const api = authed(user.email);
    await api.get('/api/v1/smart-lists').expect(200);
    const started = Date.now();
    const listed = await api.get('/api/v1/smart-lists').expect(200);
    expect(Date.now() - started).toBeLessThan(300);
    for (const item of listed.body.items as { key: string; task_count: number }[]) {
      const page = await api.get(`/api/v1/smart-lists/${item.key}/tasks?limit=1`).expect(200);
      expect(page.body.count).toBe(item.task_count);
    }
    await removeOwner(user.id);
  });

  it('CA-API-01 CA-API-02 CA-API-04: edits, pins, and rejects an empty filter', async () => {
    const user = await createOwner('filter-phase1');
    try {
      const api = authed(user.email);
      const project = await prisma.project.create({
        data: { ownerId: user.id, name: 'Inbox', isInbox: true },
      });
      await api
        .post('/api/v1/tasks')
        .send({ project_id: project.id, title: 'Leer el informe' })
        .expect(201);
      const rules = keywordRules('informe');
      const created = await api
        .post('/api/v1/filters')
        .send({ name: 'A', mode: 'normal', rules, color: '#112233' })
        .expect(201);
      const edited = await api
        .patch(`/api/v1/filters/${created.body.id}`)
        .send({
          name: 'Informes',
          color: '#445566',
          mode: 'advanced',
          rules: {
            combinator: 'AND',
            groups: [
              {
                combinator: 'OR',
                conditions: [{ field: 'keyword', op: 'contains', value: 'informe' }],
              },
            ],
          },
        })
        .expect(200);
      expect(edited.body).toMatchObject({
        name: 'Informes',
        color: '#445566',
        mode: 'advanced',
        pinned: false,
      });
      expect(edited.body.task_count).toBe(1);
      const updatedEvent = (
        await prisma.outboxEvent.findMany({
          where: { ownerId: user.id, type: 'filter.updated@v1' },
          orderBy: { occurredAt: 'desc' },
        })
      ).find((event) => filterIdOf(event.data) === created.body.id);
      expect(updatedEvent?.data).toMatchObject({
        filter: { pinned: false, name: 'Informes', task_count: 1 },
      });
      expect(updatedEvent?.previous).toMatchObject({ pinned: false, name: 'A' });

      const empty = await api
        .post('/api/v1/filters')
        .send({
          name: 'Vacío',
          mode: 'advanced',
          rules: { combinator: 'AND', groups: [{ combinator: 'AND', conditions: [] }] },
        })
        .expect(400);
      expect(empty.body.error.code).toBe('validation_failed');
      expect(empty.body.error.details).toMatchObject({ reason: 'empty_filter' });
      const preview = await api
        .post('/api/v1/filters/preview')
        .send({
          mode: 'advanced',
          rules: { combinator: 'AND', groups: [{ combinator: 'AND', conditions: [] }] },
        })
        .expect(200);
      expect(typeof preview.body.count).toBe('number');

      const inherited = await prisma.filter.create({
        data: {
          ownerId: user.id,
          name: 'Heredado',
          mode: 'advanced',
          rules: { combinator: 'AND', groups: [{ combinator: 'AND', conditions: [] }] },
          sortOrder: 9_000_000,
        },
      });
      const renamed = await api
        .patch(`/api/v1/filters/${inherited.id}`)
        .send({ name: 'Sigue vacío' })
        .expect(200);
      expect(renamed.body.name).toBe('Sigue vacío');
      expect(renamed.body.pinned).toBe(false);

      const second = await api
        .post('/api/v1/filters')
        .send({ name: 'B', mode: 'normal', rules: keywordRules('beta') })
        .expect(201);
      const third = await api
        .post('/api/v1/filters')
        .send({ name: 'C', mode: 'normal', rules: keywordRules('gamma') })
        .expect(201);
      await prisma.filter.delete({ where: { id: inherited.id } });
      await prisma.filter.delete({ where: { id: created.body.id } });
      const pinned = await api
        .patch(`/api/v1/filters/${third.body.id}`)
        .send({ pinned: true })
        .expect(200);
      expect(pinned.body.pinned).toBe(true);
      const pinEvent = (
        await prisma.outboxEvent.findMany({
          where: { ownerId: user.id, type: 'filter.updated@v1' },
          orderBy: { occurredAt: 'desc' },
        })
      ).find((event) => filterIdOf(event.data) === third.body.id);
      expect(pinEvent?.data).toMatchObject({ filter: { pinned: true } });
      expect(pinEvent?.previous).toMatchObject({ pinned: false });
      const afterPin = await api.get('/api/v1/filters').expect(200);
      expect(afterPin.body.items.map((item: { name: string }) => item.name)).toEqual(['C', 'B']);
      const unpinned = await api
        .patch(`/api/v1/filters/${third.body.id}`)
        .send({ pinned: false })
        .expect(200);
      expect(unpinned.body.pinned).toBe(false);
      const afterUnpin = await api.get('/api/v1/filters').expect(200);
      expect(afterUnpin.body.items.map((item: { name: string }) => item.name)).toEqual(['B', 'C']);
      const legacy = await api
        .patch(`/api/v1/filters/${third.body.id}`)
        .send({ pin: true })
        .expect(200);
      expect(legacy.body.pinned).toBe(true);
      const mixed = await api
        .patch(`/api/v1/filters/${third.body.id}`)
        .send({ pinned: true, before_id: second.body.id })
        .expect(400);
      expect(mixed.body.error.code).toBe('validation_failed');
    } finally {
      await removeOwner(user.id);
    }
  });

  it('CA-API-02 CA-API-03: pin order A B C and restore keeps id, order and events', async () => {
    const user = await createOwner('filter-restore');
    const otherUser = await createOwner('filter-restore-other');
    try {
      const api = authed(user.email);
      const ids: string[] = [];
      for (const name of ['A', 'B', 'C']) {
        const created = await api
          .post('/api/v1/filters')
          .send({ name, mode: 'normal', rules: keywordRules(name) })
          .expect(201);
        ids.push(created.body.id as string);
      }
      const [idA, idB, idC] = ids;
      await api.patch(`/api/v1/filters/${idC}`).send({ pinned: true }).expect(200);
      const pinnedPage = await api.get('/api/v1/filters?limit=2').expect(200);
      expect(pinnedPage.body.items.map((item: { name: string }) => item.name)).toEqual(['C', 'A']);
      expect(typeof pinnedPage.body.next_cursor).toBe('string');
      const rest = await api
        .get(`/api/v1/filters?cursor=${pinnedPage.body.next_cursor}`)
        .expect(200);
      expect(rest.body.items.map((item: { name: string }) => item.name)).toEqual(['B']);
      await api.patch(`/api/v1/filters/${idC}`).send({ pinned: false }).expect(200);
      const restoredOrder = await api.get('/api/v1/filters').expect(200);
      expect(restoredOrder.body.items.map((item: { name: string }) => item.name)).toEqual([
        'A',
        'B',
        'C',
      ]);

      await api.delete(`/api/v1/filters/${idB}`).expect(204);
      await api.delete(`/api/v1/filters/${idB}`).expect(404);
      await api.post(`/api/v1/filters/${idA}/restore`).expect(404);
      await authed(otherUser.email).post(`/api/v1/filters/${idB}/restore`).expect(404);
      const restored = await api.post(`/api/v1/filters/${idB}/restore`).expect(200);
      expect(restored.body.id).toBe(idB);
      expect(restored.body.pinned).toBe(false);
      const listed = await api.get('/api/v1/filters').expect(200);
      expect(listed.body.items.map((item: { id: string }) => item.id)).toEqual([idA, idB, idC]);
      const types = (
        await prisma.outboxEvent.findMany({
          where: { ownerId: user.id },
          orderBy: { occurredAt: 'asc' },
        })
      ).filter((event) => filterIdOf(event.data) === idB);
      expect(types.map((event) => event.type)).toEqual([
        'filter.created@v1',
        'filter.deleted@v1',
        'filter.restored@v1',
      ]);
    } finally {
      await removeOwner(user.id);
      await removeOwner(otherUser.id);
    }
  });

  it('CA-Q1: a folder filter follows the lists in that folder', async () => {
    const user = await createOwner('filter-folder');
    const stranger = await createOwner('filter-folder-other');
    try {
      const api = authed(user.email);
      const folder = await prisma.folder.create({
        data: { ownerId: user.id, name: 'Proyectos' },
      });
      const otherFolder = await prisma.folder.create({
        data: { ownerId: user.id, name: 'Casa' },
      });
      const foreign = await prisma.folder.create({
        data: { ownerId: stranger.id, name: 'Ajena' },
      });
      const inside = await prisma.project.create({
        data: { ownerId: user.id, name: 'Personal', folderId: folder.id },
      });
      const outside = await prisma.project.create({
        data: { ownerId: user.id, name: 'Bandeja', isInbox: true },
      });
      await api.post('/api/v1/tasks').send({ project_id: inside.id, title: 'Informe' }).expect(201);
      await api.post('/api/v1/tasks').send({ project_id: outside.id, title: 'Regar' }).expect(201);
      const created = await api
        .post('/api/v1/filters')
        .send({
          name: 'Trabajo',
          mode: 'normal',
          rules: {
            combinator: 'AND',
            groups: [
              {
                combinator: 'AND',
                conditions: [{ field: 'folder', op: 'in', value: [folder.id] }],
              },
            ],
          },
        })
        .expect(201);
      expect(created.body.task_count).toBe(1);
      expect(created.body.folder_labels[folder.id]).toEqual({ name: 'Proyectos', deleted: false });

      await prisma.project.update({ where: { id: inside.id }, data: { folderId: otherFolder.id } });
      const moved = await api.get(`/api/v1/filters/${created.body.id}`).expect(200);
      expect(moved.body.task_count).toBe(0);

      await prisma.folder.update({ where: { id: folder.id }, data: { deletedAt: new Date() } });
      const gone = await api.get(`/api/v1/filters/${created.body.id}`).expect(200);
      expect(gone.body.rules.groups[0].conditions[0].value).toEqual([folder.id]);
      expect(gone.body.folder_labels[folder.id].deleted).toBe(true);

      const rejected = await api
        .post('/api/v1/filters')
        .send({
          name: 'Ajena',
          mode: 'normal',
          rules: {
            combinator: 'AND',
            groups: [
              {
                combinator: 'AND',
                conditions: [{ field: 'folder', op: 'in', value: [foreign.id] }],
              },
            ],
          },
        })
        .expect(400);
      expect(rejected.body.error).toMatchObject({
        code: 'validation_failed',
        details: { reason: 'unknown_folder' },
      });
    } finally {
      await removeOwner(user.id);
      await removeOwner(stranger.id);
    }
  });

  it('CA-API-05: a tag name is stored as an id and an unknown tag is rejected', async () => {
    const user = await createOwner('filter-tags');
    try {
      const api = authed(user.email);
      const tag = await api
        .post('/api/v1/tags')
        .send({ name: 'casa', color: '#1F9D55' })
        .expect(201);
      const inbox = await prisma.project.create({
        data: { ownerId: user.id, name: 'Bandeja', isInbox: true },
      });
      await api
        .post('/api/v1/tasks')
        .send({ project_id: inbox.id, title: 'Regar', tag_ids: [tag.body.id] })
        .expect(201);
      const rules = {
        combinator: 'AND',
        groups: [
          { combinator: 'AND', conditions: [{ field: 'tag', op: 'any_of', value: ['Casa'] }] },
        ],
      };
      const created = await api
        .post('/api/v1/filters')
        .send({ name: 'Casa', mode: 'normal', rules })
        .expect(201);
      expect(created.body.rules.groups[0].conditions[0].value).toEqual([tag.body.id]);
      expect(created.body.tag_labels[tag.body.id]).toMatchObject({
        name: 'casa',
        color: '#1F9D55',
        deleted: false,
      });
      expect(created.body.task_count).toBe(1);

      await api.patch(`/api/v1/tags/${tag.body.id}`).send({ name: 'hogar' }).expect(200);
      const renamed = await api.get(`/api/v1/filters/${created.body.id}`).expect(200);
      expect(renamed.body.rules.groups[0].conditions[0].value).toEqual([tag.body.id]);
      expect(renamed.body.tag_labels[tag.body.id].name).toBe('hogar');
      expect(renamed.body.task_count).toBe(1);

      await api.delete(`/api/v1/tags/${tag.body.id}`).expect(204);
      const afterDelete = await api.get(`/api/v1/filters/${created.body.id}`).expect(200);
      expect(afterDelete.body.rules.groups[0].conditions[0].value).toEqual([tag.body.id]);
      expect(afterDelete.body.tag_labels[tag.body.id].deleted).toBe(true);
      expect(afterDelete.body.task_count).toBe(0);

      const missing = await api
        .post('/api/v1/filters')
        .send({
          name: 'Nadie',
          mode: 'normal',
          rules: {
            combinator: 'AND',
            groups: [
              {
                combinator: 'AND',
                conditions: [{ field: 'tag', op: 'any_of', value: ['no-existe'] }],
              },
            ],
          },
        })
        .expect(400);
      expect(missing.body.error).toMatchObject({
        code: 'validation_failed',
        details: { reason: 'unknown_tag' },
      });
    } finally {
      await removeOwner(user.id);
    }
  });

  it('CA-API-05: merging a tag retargets the filters that mentioned it', async () => {
    const user = await createOwner('filter-merge');
    try {
      const api = authed(user.email);
      const source = await api.post('/api/v1/tags').send({ name: 'hogar' }).expect(201);
      const target = await api.post('/api/v1/tags').send({ name: 'personal' }).expect(201);
      const created = await api
        .post('/api/v1/filters')
        .send({
          name: 'Casa',
          mode: 'normal',
          rules: {
            combinator: 'AND',
            groups: [
              {
                combinator: 'AND',
                conditions: [{ field: 'tag', op: 'any_of', value: ['Hogar'] }],
              },
            ],
          },
        })
        .expect(201);
      expect(created.body.rules.groups[0].conditions[0].value).toEqual([source.body.id]);
      await api
        .post('/api/v1/tags/merge')
        .send({ source_id: source.body.id, target_id: target.body.id })
        .expect(200);
      const event = await prisma.outboxEvent.findFirst({
        where: { ownerId: user.id, type: 'tag.merged@v1' },
        orderBy: { occurredAt: 'desc' },
      });
      expect(event?.data).toMatchObject({
        source_id: source.body.id,
        target_id: target.body.id,
      });
      const router = app.get(EventRouter);
      await router.dispatch({
        id: event?.id ?? '',
        type: 'tag.merged@v1',
        ownerId: user.id,
      });
      const moved = await api.get(`/api/v1/filters/${created.body.id}`).expect(200);
      expect(moved.body.rules.groups[0].conditions[0].value).toEqual([target.body.id]);
      expect(moved.body.tag_labels[target.body.id]).toMatchObject({
        name: 'personal',
        deleted: false,
      });
      await router.dispatch({
        id: event?.id ?? '',
        type: 'tag.merged@v1',
        ownerId: user.id,
      });
      const again = await api.get(`/api/v1/filters/${created.body.id}`).expect(200);
      expect(again.body.rules.groups[0].conditions[0].value).toEqual([target.body.id]);
    } finally {
      await removeOwner(user.id);
    }
  });

  it('TTD-FIL-19: GET /filters with 10 filters keeps a fixed query count', async () => {
    const user = await createOwner('filter-queries');
    try {
      const api = authed(user.email);
      for (let index = 0; index < 10; index += 1) {
        await api
          .post('/api/v1/filters')
          .send({ name: `F${index}`, mode: 'normal', rules: keywordRules(`q${index}`) })
          .expect(201);
      }
      const db = app.get(PrismaService);
      let queries = 0;
      (db as unknown as { $on(event: 'query', listener: () => void): void }).$on('query', () => {
        queries += 1;
      });
      await api.get('/api/v1/filters').expect(200);
      queries = 0;
      const listed = await api.get('/api/v1/filters').expect(200);
      expect(listed.body.items).toHaveLength(10);
      expect(queries).toBe(12);
    } finally {
      await removeOwner(user.id);
    }
  });

  it('CA-MCP-01: filter tools follow filters:read and filters:write', async () => {
    const user = await createOwner('filter-mcp');
    try {
      const readToken = await request(server)
        .post('/api/v1/me/tokens')
        .set('X-Dev-User-Email', user.email)
        .send({ name: 'Read filters', scopes: ['filters:read'] })
        .expect(201);
      const writeToken = await request(server)
        .post('/api/v1/me/tokens')
        .set('X-Dev-User-Email', user.email)
        .send({ name: 'Write filters', scopes: ['filters:write', 'filters:read'] })
        .expect(201);
      const readHeaders = { Authorization: `Bearer ${readToken.body.token as string}` };
      const writeHeaders = { Authorization: `Bearer ${writeToken.body.token as string}` };
      const listed = await rpc(server, readHeaders, 'tools/list', {});
      const names = (listed.body.result.tools as { name: string }[]).map((tool) => tool.name);
      expect(names).toContain('list_filters');
      expect(names).toContain('get_filter');
      expect(names).toContain('list_filter_tasks');
      expect(names).not.toContain('update_filter');
      const denied = await rpc(server, readHeaders, 'tools/call', {
        name: 'update_filter',
        arguments: { id: '00000000-0000-4000-8000-000000000001', name: 'Nope' },
      });
      expect(denied.body.result.isError).toBe(true);
      expect(toolText(denied.body as unknown)).toContain('scope_missing');

      const made = await rpc(server, writeHeaders, 'tools/call', {
        name: 'create_filter',
        arguments: { name: 'Casa', keyword: 'casa' },
      });
      expect(made.body.result.isError).toBe(false);
      const created = JSON.parse(toolText(made.body as unknown)) as { id: string; pinned: boolean };
      expect(created.pinned).toBe(false);
      const edited = await rpc(server, writeHeaders, 'tools/call', {
        name: 'update_filter',
        arguments: { id: created.id, pinned: true, name: 'Casa fija' },
      });
      expect(JSON.parse(toolText(edited.body as unknown))).toMatchObject({
        pinned: true,
        name: 'Casa fija',
      });
      const tasks = await rpc(server, writeHeaders, 'tools/call', {
        name: 'list_filter_tasks',
        arguments: { id: created.id, limit: 5 },
      });
      expect(JSON.parse(toolText(tasks.body as unknown))).toMatchObject({ count: 0 });
      const removed = await rpc(server, writeHeaders, 'tools/call', {
        name: 'delete_filter',
        arguments: { id: created.id },
      });
      expect(JSON.parse(toolText(removed.body as unknown))).toEqual({ deleted: true });
      const restored = await rpc(server, writeHeaders, 'tools/call', {
        name: 'restore_filter',
        arguments: { id: created.id },
      });
      expect(JSON.parse(toolText(restored.body as unknown))).toMatchObject({
        id: created.id,
        pinned: true,
      });
      const events = (
        await prisma.outboxEvent.findMany({
          where: { ownerId: user.id },
          orderBy: { occurredAt: 'asc' },
        })
      ).filter((event) => filterIdOf(event.data) === created.id);
      expect(events.map((event) => event.type)).toEqual([
        'filter.created@v1',
        'filter.updated@v1',
        'filter.deleted@v1',
        'filter.restored@v1',
      ]);
    } finally {
      await removeOwner(user.id);
    }
  });
});

function filterIdOf(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || !('filter' in data)) {
    return undefined;
  }
  const filter = (data as { filter?: { id?: unknown } }).filter;
  return typeof filter?.id === 'string' ? filter.id : undefined;
}

function keywordRules(value: string) {
  return {
    combinator: 'AND',
    groups: [{ combinator: 'AND', conditions: [{ field: 'keyword', op: 'contains', value }] }],
  };
}

function toolText(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('result' in body)) {
    throw new Error('missing tool result');
  }
  const result = body.result;
  if (typeof result !== 'object' || result === null || !('content' in result)) {
    throw new Error('missing tool content');
  }
  const content = result.content;
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error('missing tool content');
  }
  const first: unknown = content[0];
  if (
    typeof first !== 'object' ||
    first === null ||
    !('text' in first) ||
    typeof first.text !== 'string'
  ) {
    throw new Error('missing tool text');
  }
  return first.text;
}

function rpc(http: SuperTestApp, headers: Record<string, string>, method: string, params: unknown) {
  return request(http)
    .post('/api/v1/mcp')
    .set(headers)
    .send({ jsonrpc: '2.0', id: 1, method, params });
}

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
