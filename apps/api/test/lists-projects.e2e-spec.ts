import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { newPersonalAccessToken } from '../src/auth/token-secret.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';

type SuperTestApp = Parameters<typeof request>[0];

loadRootEnv();
process.env.AUTH_MODE = 'dev';
process.env.SCHEDULER_AUTOSTART = 'false';
process.env.BUS_AUTOSTART = 'false';

const prisma = new PrismaClient();

describe('lists, folders and projects', () => {
  let app: INestApplication;
  let server: SuperTestApp;
  let ownerId: string;
  let inboxId: string;
  let writerToken: string;
  let readerToken: string;

  beforeAll(async () => {
    await prisma.$connect();
    const owner = await prisma.user.create({
      data: {
        email: `lists-${randomUUID()}@reflexionia.test`,
        displayName: 'Listas',
        timeZone: 'Europe/Madrid',
      },
    });
    ownerId = owner.id;
    const inbox = await prisma.project.create({
      data: { ownerId, name: 'Bandeja', isInbox: true },
    });
    inboxId = inbox.id;
    const writer = newPersonalAccessToken();
    const reader = newPersonalAccessToken();
    writerToken = writer.token;
    readerToken = reader.token;
    await prisma.personalAccessToken.create({
      data: {
        ownerId,
        name: 'lists-write',
        tokenHash: writer.hash,
        tokenPrefix: writer.prefix,
        scopes: ['lists:read', 'lists:write', 'tasks:read', 'tasks:write'],
      },
    });
    await prisma.personalAccessToken.create({
      data: {
        ownerId,
        name: 'lists-read',
        tokenHash: reader.hash,
        tokenPrefix: reader.prefix,
        scopes: ['lists:read'],
      },
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as SuperTestApp;
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.idempotencyRecord.deleteMany({ where: { ownerId } });
    await prisma.outboxEvent.deleteMany({ where: { ownerId } });
    await prisma.activityLog.deleteMany({ where: { ownerId } });
    await prisma.personalAccessToken.deleteMany({ where: { ownerId } });
    await prisma.task.updateMany({ where: { ownerId }, data: { parentId: null } });
    await prisma.task.deleteMany({ where: { ownerId } });
    await prisma.column.deleteMany({ where: { ownerId } });
    await prisma.project.deleteMany({ where: { ownerId } });
    await prisma.folder.deleteMany({ where: { ownerId } });
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  function api() {
    const headers = { Authorization: `Bearer ${writerToken}` };
    return {
      get: (url: string) => request(server).get(url).set(headers),
      post: (url: string) => request(server).post(url).set(headers),
      patch: (url: string) => request(server).patch(url).set(headers),
      delete: (url: string) => request(server).delete(url).set(headers),
    };
  }

  async function tool(
    name: string,
    args: Record<string, unknown> = {},
    token = writerToken,
  ): Promise<{ isError: boolean; value: Record<string, unknown>; text: string }> {
    const response = await request(server)
      .post('/api/v1/mcp')
      .set('Authorization', `Bearer ${token}`)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
      .expect(200);
    const text = String(response.body.result.content[0].text);
    const isError = response.body.result.isError === true;
    return { isError, text, value: isError ? {} : (JSON.parse(text) as Record<string, unknown>) };
  }

  it('walks folders and project state over MCP and leaves tasks in place', async () => {
    const folder = await tool('create_folder', { name: 'Personal' });
    expect(folder.isError).toBe(false);
    const folderId = String(folder.value.id);

    const project = await tool('create_project', {
      name: 'reforma-cocina',
      folder_id: folderId,
      is_project: true,
      outcome: '  Cocina usable  ',
    });
    expect(project.isError).toBe(false);
    expect(project.value).toMatchObject({
      name: 'reforma-cocina',
      folder_id: folderId,
      is_project: true,
      outcome: 'Cocina usable',
      state: 'active',
      project_status: 'active',
      closed: false,
      closed_at: null,
    });
    const projectId = String(project.value.id);

    const other = await tool('create_project', { name: 'compras' });
    const otherId = String(other.value.id);
    const task = await api()
      .post('/api/v1/tasks')
      .send({ project_id: otherId, title: 'Azulejos' })
      .expect(201);

    const moved = await tool('update_project', { id: otherId, folder_id: folderId });
    expect(moved.isError).toBe(false);
    expect(moved.value.folder_id).toBe(folderId);
    const sameFolder = await tool('update_project', { id: otherId, folder_id: folderId });
    expect(sameFolder.isError).toBe(false);
    expect(sameFolder.value.folder_id).toBe(folderId);

    const renamed = await tool('update_folder', { id: folderId, name: 'Casa' });
    expect(renamed.value.name).toBe('Casa');

    const paused = await tool('set_project_state', { id: projectId, state: 'paused' });
    expect(paused.value).toMatchObject({
      state: 'paused',
      project_status: 'paused',
      closed: false,
    });
    const beforeRepeat = await prisma.outboxEvent.count({
      where: { ownerId, type: 'project.updated@v1' },
    });
    const again = await tool('set_project_state', { id: projectId, state: 'paused' });
    expect(again.isError).toBe(false);
    const afterRepeat = await prisma.outboxEvent.count({
      where: { ownerId, type: 'project.updated@v1' },
    });
    expect(afterRepeat).toBe(beforeRepeat);

    const archived = await tool('set_project_state', { id: projectId, state: 'archived' });
    expect(archived.value).toMatchObject({
      state: 'archived',
      closed: true,
      project_status: 'paused',
    });
    expect(typeof archived.value.closed_at).toBe('string');

    const archivedPage = await tool('list_projects', { state: 'archived', is_project: true });
    const found = (archivedPage.value.items as { id: string; closed_at: string | null }[]).find(
      (item) => item.id === projectId,
    );
    expect(found?.closed_at).toBe(archived.value.closed_at);

    const opened = await tool('unarchive_project', { id: projectId });
    expect(opened.value).toMatchObject({
      state: 'active',
      closed: false,
      closed_at: null,
      project_status: 'active',
    });

    const removed = await tool('delete_folder', { id: folderId });
    expect(removed.value.deleted).toBe(true);
    expect(removed.value.moved_list_ids).toEqual(expect.arrayContaining([projectId, otherId]));
    const after = await api().get(`/api/v1/projects/${projectId}`).expect(200);
    expect(after.body.folder_id).toBeNull();
    const otherAfter = await api().get(`/api/v1/projects/${otherId}`).expect(200);
    expect(otherAfter.body.folder_id).toBeNull();
    await api()
      .get(`/api/v1/tasks/${String(task.body.id)}`)
      .expect(200);
  });

  it('refuses to delete an open project, then requires the exact task count', async () => {
    const created = await api()
      .post('/api/v1/projects')
      .send({ name: 'borrar-proyecto', is_project: true, outcome: 'Hecho' })
      .expect(201);
    const id = created.body.id as string;
    const parent = await prisma.task.create({
      data: { ownerId, projectId: id, createdById: ownerId, title: 'Abierta' },
    });
    await prisma.task.create({
      data: { ownerId, projectId: id, createdById: ownerId, title: 'Hecha', status: 'completed' },
    });
    await prisma.task.create({
      data: {
        ownerId,
        projectId: id,
        createdById: ownerId,
        title: 'Sub',
        parentId: parent.id,
        status: 'cancelled',
      },
    });

    const refused = await tool('delete_project', { id, confirm_task_count: 3 });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('project_not_archived');
    expect(await prisma.project.findUnique({ where: { id } })).toMatchObject({ deletedAt: null });

    await api().post(`/api/v1/projects/${id}/archive`).expect(200);
    const preview = await tool('delete_project', { id, dry_run: true });
    expect(preview.isError).toBe(false);
    expect(preview.value).toMatchObject({
      deleted: false,
      task_count: 3,
      completed_count: 1,
      open_count: 1,
      subtask_count: 1,
    });

    const mismatch = await api().delete(`/api/v1/projects/${id}?expected_task_count=2`).expect(409);
    expect(mismatch.body.error.code).toBe('confirmation_mismatch');
    expect(await prisma.task.count({ where: { projectId: id, deletedAt: null } })).toBe(3);

    const impact = await api().get(`/api/v1/projects/${id}/deletion-impact`).expect(200);
    expect(impact.body.task_count).toBe(3);
    await api().delete(`/api/v1/projects/${id}?expected_task_count=3`).expect(204);
    expect((await prisma.project.findUnique({ where: { id } }))?.deletedAt).not.toBeNull();
  });

  it('counts folder totals and filters projects by state and folder', async () => {
    const empty = await api().post('/api/v1/folders').send({ name: 'Vacía' }).expect(201);
    const listed = await tool('list_folders');
    const emptyRow = (
      listed.value.items as { id: string; project_count: number; active_task_count: number }[]
    ).find((item) => item.id === empty.body.id);
    expect(emptyRow).toMatchObject({ project_count: 0, active_task_count: 0 });

    const home = await api().post('/api/v1/folders').send({ name: 'Totales' }).expect(201);
    const active = await api()
      .post('/api/v1/projects')
      .send({ name: 'en-marcha', folder_id: home.body.id, is_project: true })
      .expect(201);
    const paused = await api()
      .post('/api/v1/projects')
      .send({
        name: 'en-pausa',
        folder_id: home.body.id,
        is_project: true,
        project_status: 'paused',
      })
      .expect(201);
    const loose = await api().post('/api/v1/projects').send({ name: 'suelta' }).expect(201);
    await api()
      .post('/api/v1/tasks')
      .send({ project_id: active.body.id, title: 'Una' })
      .expect(201);
    const rootId = (
      await prisma.task.findFirstOrThrow({
        where: { projectId: String(active.body.id), parentId: null },
      })
    ).id;
    await prisma.task.create({
      data: {
        ownerId,
        projectId: String(active.body.id),
        createdById: ownerId,
        title: 'Hija',
        parentId: rootId,
      },
    });

    const folder = await api()
      .get(`/api/v1/folders/${String(home.body.id)}`)
      .expect(200);
    expect(folder.body).toMatchObject({ project_count: 2, active_task_count: 1 });

    const pausedPage = await api().get('/api/v1/projects?is_project=true&state=paused').expect(200);
    const pausedIds = (pausedPage.body.items as { id: string; state: string }[]).map(
      (item) => item.id,
    );
    expect(pausedIds).toContain(paused.body.id);
    expect(pausedIds).not.toContain(active.body.id);
    expect(
      (pausedPage.body.items as { state: string; is_project: boolean }[]).every(
        (item) => item.state === 'paused' && item.is_project,
      ),
    ).toBe(true);

    const loosePage = await api().get('/api/v1/projects?folder_id=none').expect(200);
    const looseIds = (loosePage.body.items as { id: string; folder_id: string | null }[]).map(
      (item) => item.id,
    );
    expect(looseIds).toContain(loose.body.id);
    expect(looseIds).toContain(inboxId);
    expect(looseIds).not.toContain(active.body.id);
    expect(
      (loosePage.body.items as { folder_id: string | null }[]).every(
        (item) => item.folder_id === null,
      ),
    ).toBe(true);

    await api()
      .delete(`/api/v1/folders/${String(empty.body.id)}`)
      .expect(204);
  });

  it('hides write tools from a lists:read token and rejects bad project edits', async () => {
    const listed = await request(server)
      .post('/api/v1/mcp')
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
      .expect(200);
    const names = (listed.body.result.tools as { name: string }[]).map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(['list_folders', 'list_projects']));
    for (const name of [
      'create_folder',
      'update_folder',
      'delete_folder',
      'create_project',
      'update_project',
      'set_project_state',
      'archive_project',
      'unarchive_project',
      'delete_project',
    ]) {
      expect(names, name).not.toContain(name);
    }

    const tooLong = await api()
      .post('/api/v1/projects')
      .send({ name: 'largo', outcome: 'x'.repeat(201) })
      .expect(400);
    expect(tooLong.body.error.code).toBe('validation_failed');

    const inbox = await api()
      .patch(`/api/v1/projects/${inboxId}`)
      .send({ is_project: true })
      .expect(422);
    expect(inbox.body.error.code).toBe('inbox_not_project');

    const plain = await api().post('/api/v1/projects').send({ name: 'lista-normal' }).expect(201);
    const state = await api()
      .post(`/api/v1/projects/${String(plain.body.id)}/state`)
      .send({ state: 'paused' })
      .expect(422);
    expect(state.body.error.code).toBe('not_a_project');

    const missing = await api()
      .patch(`/api/v1/projects/${String(plain.body.id)}`)
      .send({ folder_id: randomUUID() })
      .expect(404);
    expect(missing.body.error.code).toBe('folder_not_found');

    const paused = await api()
      .post('/api/v1/projects')
      .send({ name: 'pausa-archivo', is_project: true, project_status: 'paused' })
      .expect(201);
    const kept = await api()
      .post(`/api/v1/projects/${String(paused.body.id)}/state`)
      .send({ state: 'archived' })
      .expect(200);
    expect(kept.body).toMatchObject({ state: 'archived', project_status: 'paused', closed: true });
    expect(kept.body.closed_at).toEqual(expect.any(String));
    const back = await api()
      .post(`/api/v1/projects/${String(paused.body.id)}/state`)
      .send({ state: 'paused' })
      .expect(200);
    expect(back.body).toMatchObject({
      state: 'paused',
      project_status: 'paused',
      closed: false,
      closed_at: null,
    });
    const dropped = await api()
      .patch(`/api/v1/projects/${String(paused.body.id)}`)
      .send({ is_project: false })
      .expect(200);
    expect(dropped.body.is_project).toBe(false);
    expect(dropped.body.project_status).toBe('paused');
  });
});
