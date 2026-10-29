import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { API_SCOPES } from '../src/auth/scopes.js';
import { newPersonalAccessToken } from '../src/auth/token-secret.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';

type SuperTestApp = Parameters<typeof request>[0];

loadRootEnv();
process.env.AUTH_MODE = 'dev';
process.env.SCHEDULER_AUTOSTART = 'false';
process.env.BUS_AUTOSTART = 'false';

const prisma = new PrismaClient();
const READ_SCOPES = API_SCOPES.filter((scope) => scope.endsWith(':read'));
const WRITE_TOOLS = [
  'create_folder',
  'update_folder',
  'delete_folder',
  'create_project',
  'update_project',
  'set_project_state',
  'archive_project',
  'unarchive_project',
  'delete_project',
  'mark_project_reviewed',
  'share_project',
  'unshare_project',
  'create_project_public_link',
  'regenerate_project_public_link',
  'revoke_project_public_link',
  'create_task',
  'update_work_context',
] as const;

const PROJECT_FIELDS = [
  'color',
  'view_mode',
  'is_project',
  'outcome',
  'state',
  'project_status',
  'closed',
] as const;

describe('lists, projects and work context parity', () => {
  let app: INestApplication;
  let server: SuperTestApp;
  let ownerId: string;
  let otherId: string;
  let otherEmail: string;
  let writerToken: string;
  let readerToken: string;
  let tasksOnlyToken: string;
  const previousPort = process.env.PORT;

  beforeAll(async () => {
    await prisma.$connect();
    const owner = await prisma.user.create({
      data: {
        email: `parity-${randomUUID()}@reflexionia.test`,
        displayName: 'Paridad',
        timeZone: 'Europe/Madrid',
      },
    });
    ownerId = owner.id;
    otherEmail = `share-${randomUUID()}@example.com`;
    const other = await prisma.user.create({
      data: { email: otherEmail, displayName: 'Invitado', timeZone: 'Europe/Madrid' },
    });
    otherId = other.id;
    await prisma.project.create({ data: { ownerId, name: 'Bandeja', isInbox: true } });
    const writer = newPersonalAccessToken();
    const reader = newPersonalAccessToken();
    const tasksOnly = newPersonalAccessToken();
    writerToken = writer.token;
    readerToken = reader.token;
    tasksOnlyToken = tasksOnly.token;
    await prisma.personalAccessToken.createMany({
      data: [
        {
          ownerId,
          name: 'parity-write',
          tokenHash: writer.hash,
          tokenPrefix: writer.prefix,
          scopes: [...API_SCOPES],
        },
        {
          ownerId,
          name: 'parity-read',
          tokenHash: reader.hash,
          tokenPrefix: reader.prefix,
          scopes: [...READ_SCOPES],
        },
        {
          ownerId,
          name: 'parity-tasks',
          tokenHash: tasksOnly.hash,
          tokenPrefix: tasksOnly.prefix,
          scopes: ['tasks:read'],
        },
      ],
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    const http = app.getHttpServer() as { address(): AddressInfo };
    process.env.PORT = String(http.address().port);
    server = app.getHttpServer() as SuperTestApp;
  }, 60_000);

  afterAll(async () => {
    await app.close();
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
    for (const id of [ownerId, otherId]) {
      await prisma.idempotencyRecord.deleteMany({ where: { ownerId: id } });
      await prisma.outboxEvent.deleteMany({ where: { ownerId: id } });
      await prisma.activityLog.deleteMany({ where: { ownerId: id } });
      await prisma.planMember.deleteMany({ where: { plan: { ownerId: id } } });
      await prisma.dayPlan.deleteMany({ where: { ownerId: id } });
      await prisma.projectMember.deleteMany({ where: { OR: [{ ownerId: id }, { memberId: id }] } });
      await prisma.personalAccessToken.deleteMany({ where: { ownerId: id } });
      await prisma.taskTag.deleteMany({ where: { task: { ownerId: id } } });
      await prisma.task.updateMany({ where: { ownerId: id }, data: { parentId: null } });
      await prisma.task.deleteMany({ where: { ownerId: id } });
      await prisma.tag.deleteMany({ where: { ownerId: id } });
      await prisma.smartList.deleteMany({ where: { ownerId: id } });
      await prisma.column.deleteMany({ where: { ownerId: id } });
      await prisma.project.deleteMany({ where: { ownerId: id } });
      await prisma.folder.deleteMany({ where: { ownerId: id } });
      await prisma.user.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  function api(token = writerToken) {
    const headers = { Authorization: `Bearer ${token}` };
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

  async function toolNames(token: string): Promise<string[]> {
    const response = await request(server)
      .post('/api/v1/mcp')
      .set('Authorization', `Bearer ${token}`)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
      .expect(200);
    return (response.body.result.tools as { name: string }[]).map((item) => item.name);
  }

  function idsOf(body: unknown): string[] {
    if (typeof body !== 'object' || body === null || !('items' in body)) return [];
    const items = body.items;
    if (!Array.isArray(items)) return [];
    return items.flatMap((item: unknown) =>
      typeof item === 'object' && item !== null && typeof (item as { id?: unknown }).id === 'string'
        ? [(item as { id: string }).id]
        : [],
    );
  }

  function taskIds(value: unknown): string[] {
    const found = new Set<string>();
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }
      if (typeof node !== 'object' || node === null) return;
      const record = node as Record<string, unknown>;
      if (typeof record.id === 'string' && typeof record.title === 'string') found.add(record.id);
      for (const key of ['items', 'tasks', 'groups']) {
        if (key in record) visit(record[key]);
      }
    };
    visit(value);
    return [...found];
  }

  async function project(id: string): Promise<Record<string, unknown>> {
    const response = await api().get(`/api/v1/projects/${id}`).expect(200);
    return response.body as Record<string, unknown>;
  }

  function comparable(body: Record<string, unknown>): Record<string, unknown> {
    const picked: Record<string, unknown> = {};
    for (const field of PROJECT_FIELDS) picked[field] = body[field];
    picked.closed_at_set = typeof body.closed_at === 'string';
    picked.folder_id = body.folder_id;
    return picked;
  }

  it('lists folders with totals over REST and MCP', async () => {
    const folder = await api()
      .post('/api/v1/folders')
      .send({ name: 'Totales paridad' })
      .expect(201);
    const list = await api()
      .post('/api/v1/projects')
      .send({ name: 'dentro', folder_id: folder.body.id })
      .expect(201);
    await api().post('/api/v1/tasks').send({ project_id: list.body.id, title: 'Una' }).expect(201);

    const rest = await api().get('/api/v1/folders?limit=100').expect(200);
    const viaTool = await tool('list_folders', { limit: 100 });
    expect(viaTool.isError).toBe(false);
    const fromRest = (rest.body.items as { id: string }[]).find(
      (item) => item.id === folder.body.id,
    );
    const fromMcp = (viaTool.value.items as { id: string }[]).find(
      (item) => item.id === folder.body.id,
    );
    expect(fromMcp).toEqual(fromRest);
    expect(fromRest).toMatchObject({ project_count: 1, active_task_count: 1 });
  });

  it('creates, renames and reorders a folder over REST and MCP', async () => {
    const rest = await api().post('/api/v1/folders').send({ name: 'Alfa rest' }).expect(201);
    const renamed = await api()
      .patch(`/api/v1/folders/${String(rest.body.id)}`)
      .send({ name: 'Alfa rest 2' })
      .expect(200);
    const listed = await tool('list_folders', { limit: 100 });
    const fromMcp = (listed.value.items as { id: string; name: string }[]).find(
      (item) => item.id === rest.body.id,
    );
    expect(fromMcp).toEqual(renamed.body);

    const created = await tool('create_folder', { name: 'Beta mcp' });
    expect(created.isError).toBe(false);
    const mcpRenamed = await tool('update_folder', { id: created.value.id, name: 'Beta mcp 2' });
    const fetched = await api()
      .get(`/api/v1/folders/${String(created.value.id)}`)
      .expect(200);
    expect(fetched.body).toEqual(mcpRenamed.value);

    const anchor = await api().post('/api/v1/folders').send({ name: 'Ancla' }).expect(201);
    const moving = await api().post('/api/v1/folders').send({ name: 'Mueve rest' }).expect(201);
    await api()
      .patch(`/api/v1/folders/${String(moving.body.id)}`)
      .send({ before_id: anchor.body.id })
      .expect(200);
    const afterRest = await api().get('/api/v1/folders?limit=100').expect(200);
    const restRows = afterRest.body.items as { id: string; sort_order: string }[];
    const restMoving = restRows.find((item) => item.id === moving.body.id);
    const restAnchor = restRows.find((item) => item.id === anchor.body.id);
    expect(BigInt(String(restMoving?.sort_order))).toBeLessThan(
      BigInt(String(restAnchor?.sort_order)),
    );

    const mcpAnchor = await tool('create_folder', { name: 'Ancla mcp' });
    const mcpMoving = await tool('create_folder', { name: 'Mueve mcp' });
    const reordered = await tool('update_folder', {
      id: mcpMoving.value.id,
      before_id: mcpAnchor.value.id,
    });
    expect(reordered.isError).toBe(false);
    const afterMcp = await tool('list_folders', { limit: 100 });
    const mcpRows = afterMcp.value.items as { id: string; sort_order: string }[];
    const movedRow = mcpRows.find((item) => item.id === mcpMoving.value.id);
    const anchorRow = mcpRows.find((item) => item.id === mcpAnchor.value.id);
    expect(BigInt(String(movedRow?.sort_order))).toBeLessThan(
      BigInt(String(anchorRow?.sort_order)),
    );
    const restOrder = await api().get('/api/v1/folders?limit=100').expect(200);
    expect((restOrder.body.items as { id: string }[]).map((item) => item.id)).toEqual(
      mcpRows.map((item) => item.id),
    );
  });

  it('deletes a folder and moves its lists out, returning moved_list_ids from MCP', async () => {
    const restFolder = await api()
      .post('/api/v1/folders')
      .send({ name: 'Borrar rest' })
      .expect(201);
    const restList = await api()
      .post('/api/v1/projects')
      .send({ name: 'lista-rest', folder_id: restFolder.body.id })
      .expect(201);
    await api()
      .delete(`/api/v1/folders/${String(restFolder.body.id)}`)
      .expect(204);
    expect((await project(String(restList.body.id))).folder_id).toBeNull();

    const mcpFolder = await tool('create_folder', { name: 'Borrar mcp' });
    const mcpList = await tool('create_project', {
      name: 'lista-mcp',
      folder_id: mcpFolder.value.id,
    });
    const removed = await tool('delete_folder', { id: mcpFolder.value.id });
    expect(removed.isError).toBe(false);
    expect(removed.value.deleted).toBe(true);
    expect(removed.value.moved_list_ids).toEqual([mcpList.value.id]);
    expect((await project(String(mcpList.value.id))).folder_id).toBeNull();
    const gone = await api()
      .get(`/api/v1/folders/${String(mcpFolder.value.id)}`)
      .expect(404);
    expect(gone.body.error.code).toBe('folder_not_found');
  });

  it('undoes a folder delete by creating the folder again and moving the lists back', async () => {
    const folder = await api().post('/api/v1/folders').send({ name: 'Deshacer' }).expect(201);
    const list = await api()
      .post('/api/v1/projects')
      .send({ name: 'vuelve', folder_id: folder.body.id })
      .expect(201);
    await api()
      .delete(`/api/v1/folders/${String(folder.body.id)}`)
      .expect(204);
    const restored = await api().post('/api/v1/folders').send({ name: 'Deshacer' }).expect(201);
    const patched = await api()
      .patch(`/api/v1/projects/${String(list.body.id)}`)
      .send({ folder_id: restored.body.id })
      .expect(200);
    expect(patched.body.folder_id).toBe(restored.body.id);

    const mcpFolder = await tool('create_folder', { name: 'Deshacer mcp' });
    const mcpList = await tool('create_project', {
      name: 'vuelve-mcp',
      folder_id: mcpFolder.value.id,
    });
    await tool('delete_folder', { id: mcpFolder.value.id });
    const again = await tool('create_folder', { name: 'Deshacer mcp' });
    const moved = await tool('update_project', { id: mcpList.value.id, folder_id: again.value.id });
    expect(moved.isError).toBe(false);
    const fetched = await project(String(mcpList.value.id));
    expect(fetched.folder_id).toBe(again.value.id);
    expect(fetched.folder_id).toBe(moved.value.folder_id);
  });

  it('creates a list with folder, color, view, project flag and outcome', async () => {
    const folder = await api().post('/api/v1/folders').send({ name: 'Nueva lista' }).expect(201);
    const payload = {
      folder_id: folder.body.id as string,
      color: '#336699',
      view_mode: 'kanban',
      is_project: true,
      outcome: 'Cocina usable',
    };
    const rest = await api()
      .post('/api/v1/projects')
      .send({ name: 'lista-rest', ...payload })
      .expect(201);
    const viaList = await tool('list_projects', { limit: 100 });
    const found = (viaList.value.items as { id: string }[]).find(
      (item) => item.id === rest.body.id,
    );
    expect(found).toEqual(rest.body);

    const mcp = await tool('create_project', { name: 'lista-mcp', ...payload });
    expect(mcp.isError).toBe(false);
    const fetched = await project(String(mcp.value.id));
    expect(fetched).toEqual(mcp.value);
    expect(comparable(fetched)).toEqual(comparable(rest.body as Record<string, unknown>));
  });

  it('edits a list and moves it between folders', async () => {
    const home = await api().post('/api/v1/folders').send({ name: 'Casa' }).expect(201);
    const away = await api().post('/api/v1/folders').send({ name: 'Fuera' }).expect(201);
    const rest = await api().post('/api/v1/projects').send({ name: 'mover-rest' }).expect(201);
    const patched = await api()
      .patch(`/api/v1/projects/${String(rest.body.id)}`)
      .send({ name: 'mover-rest-2', folder_id: home.body.id, color: '#112233' })
      .expect(200);
    const seen = await tool('list_projects', { limit: 100, folder_id: home.body.id });
    expect((seen.value.items as { id: string }[]).find((item) => item.id === rest.body.id)).toEqual(
      patched.body,
    );

    const mcp = await tool('create_project', { name: 'mover-mcp' });
    const updated = await tool('update_project', {
      id: mcp.value.id,
      name: 'mover-mcp-2',
      folder_id: away.body.id,
      color: '#112233',
    });
    expect(updated.isError).toBe(false);
    expect(await project(String(mcp.value.id))).toEqual(updated.value);
    expect(updated.value).toMatchObject({
      name: 'mover-mcp-2',
      folder_id: away.body.id,
      color: '#112233',
    });
  });

  it('marks and clears the project flag and outcome', async () => {
    const rest = await api().post('/api/v1/projects').send({ name: 'marca-rest' }).expect(201);
    const marked = await api()
      .patch(`/api/v1/projects/${String(rest.body.id)}`)
      .send({ is_project: true, outcome: 'Terminar' })
      .expect(200);
    expect(marked.body).toMatchObject({ is_project: true, outcome: 'Terminar', state: 'active' });
    const cleared = await api()
      .patch(`/api/v1/projects/${String(rest.body.id)}`)
      .send({ is_project: false, outcome: null })
      .expect(200);
    const viaTool = await tool('list_projects', { limit: 100 });
    expect(
      (viaTool.value.items as { id: string }[]).find((item) => item.id === rest.body.id),
    ).toEqual(cleared.body);

    const mcp = await tool('create_project', { name: 'marca-mcp' });
    const on = await tool('update_project', {
      id: mcp.value.id,
      is_project: true,
      outcome: 'Terminar',
    });
    expect(on.value).toMatchObject({ is_project: true, outcome: 'Terminar', state: 'active' });
    const off = await tool('update_project', {
      id: mcp.value.id,
      is_project: false,
      outcome: null,
    });
    expect(await project(String(mcp.value.id))).toEqual(off.value);
    expect(off.value).toMatchObject({ is_project: false, outcome: null });
  });

  it('pauses, resumes and archives a project over REST and MCP', async () => {
    const rest = await api()
      .post('/api/v1/projects')
      .send({ name: 'estado-rest', is_project: true, outcome: 'Seguir' })
      .expect(201);
    const paused = await api()
      .post(`/api/v1/projects/${String(rest.body.id)}/state`)
      .send({ state: 'paused' })
      .expect(200);
    expect(paused.body).toMatchObject({ state: 'paused', closed: false, project_status: 'paused' });
    const resumed = await api()
      .post(`/api/v1/projects/${String(rest.body.id)}/state`)
      .send({ state: 'active' })
      .expect(200);
    expect(resumed.body).toMatchObject({ state: 'active', closed: false, closed_at: null });
    const archived = await api()
      .post(`/api/v1/projects/${String(rest.body.id)}/state`)
      .send({ state: 'archived' })
      .expect(200);
    expect(archived.body).toMatchObject({ state: 'archived', closed: true });

    const mcp = await tool('create_project', {
      name: 'estado-mcp',
      is_project: true,
      outcome: 'Seguir',
    });
    const mcpPaused = await tool('set_project_state', { id: mcp.value.id, state: 'paused' });
    const mcpResumed = await tool('set_project_state', { id: mcp.value.id, state: 'active' });
    const mcpArchived = await tool('set_project_state', { id: mcp.value.id, state: 'archived' });
    expect(comparable(mcpPaused.value)).toEqual(comparable(paused.body as Record<string, unknown>));
    expect(comparable(mcpResumed.value)).toEqual(
      comparable(resumed.body as Record<string, unknown>),
    );
    expect(comparable(mcpArchived.value)).toEqual(
      comparable(archived.body as Record<string, unknown>),
    );
    expect(await project(String(mcp.value.id))).toEqual(mcpArchived.value);
  });

  it('lists an archived project as closed and returns it to active when unarchived', async () => {
    const created = await tool('create_project', {
      name: 'coherente',
      is_project: true,
      outcome: 'Cerrar',
    });
    const archived = await tool('set_project_state', { id: created.value.id, state: 'archived' });
    expect(archived.value).toMatchObject({ state: 'archived', closed: true });
    expect(typeof archived.value.closed_at).toBe('string');

    const viaTool = await tool('list_projects', {
      state: 'archived',
      is_project: true,
      limit: 100,
    });
    const viaRest = await api()
      .get('/api/v1/projects?state=archived&is_project=true&limit=100')
      .expect(200);
    const toolRow = (viaTool.value.items as { id: string }[]).find(
      (item) => item.id === created.value.id,
    );
    const restRow = (viaRest.body.items as { id: string }[]).find(
      (item) => item.id === created.value.id,
    );
    expect(toolRow).toEqual(restRow);
    expect(toolRow).toMatchObject({ closed: true, state: 'archived' });

    const opened = await tool('unarchive_project', { id: created.value.id });
    expect(opened.value).toMatchObject({
      state: 'active',
      closed: false,
      closed_at: null,
      project_status: 'active',
    });
    const restOpened = await api()
      .post('/api/v1/projects')
      .send({ name: 'coherente-rest', is_project: true, outcome: 'Cerrar' })
      .expect(201);
    await api()
      .post(`/api/v1/projects/${String(restOpened.body.id)}/archive`)
      .expect(200);
    const unarchived = await api()
      .post(`/api/v1/projects/${String(restOpened.body.id)}/unarchive`)
      .expect(200);
    expect(comparable(unarchived.body as Record<string, unknown>)).toEqual(
      comparable(opened.value),
    );
    const still = await tool('list_projects', { state: 'archived', limit: 100 });
    expect((still.value.items as { id: string }[]).map((item) => item.id)).not.toContain(
      created.value.id,
    );
  });

  it('archives and unarchives a normal list', async () => {
    const rest = await api().post('/api/v1/projects').send({ name: 'archivo-rest' }).expect(201);
    const archived = await api()
      .post(`/api/v1/projects/${String(rest.body.id)}/archive`)
      .expect(200);
    expect(archived.body).toMatchObject({ closed: true, state: 'archived' });
    const opened = await api()
      .post(`/api/v1/projects/${String(rest.body.id)}/unarchive`)
      .expect(200);
    expect(opened.body).toMatchObject({ closed: false, closed_at: null });

    const mcp = await tool('create_project', { name: 'archivo-mcp' });
    const mcpArchived = await tool('archive_project', { id: mcp.value.id });
    const mcpOpened = await tool('unarchive_project', { id: mcp.value.id });
    expect(comparable(mcpArchived.value)).toEqual(
      comparable(archived.body as Record<string, unknown>),
    );
    expect(await project(String(mcp.value.id))).toEqual(mcpOpened.value);
    expect(mcpOpened.value).toMatchObject({ closed: false, closed_at: null });
  });

  it('previews deletion impact over REST and MCP dry run', async () => {
    async function archivedProject(name: string, channel: 'rest' | 'mcp'): Promise<string> {
      const id =
        channel === 'rest'
          ? String(
              (
                await api()
                  .post('/api/v1/projects')
                  .send({ name, is_project: true, outcome: 'Borrar' })
                  .expect(201)
              ).body.id,
            )
          : String(
              (await tool('create_project', { name, is_project: true, outcome: 'Borrar' })).value
                .id,
            );
      await api().post('/api/v1/tasks').send({ project_id: id, title: 'Abierta' }).expect(201);
      await api().post(`/api/v1/projects/${id}/archive`).expect(200);
      return id;
    }
    const restId = await archivedProject('impacto-rest', 'rest');
    const impact = await api().get(`/api/v1/projects/${restId}/deletion-impact`).expect(200);
    expect(impact.body).toMatchObject({
      project_id: restId,
      task_count: 1,
      open_count: 1,
      is_project: true,
      closed: true,
    });

    const mcpId = await archivedProject('impacto-mcp', 'mcp');
    const preview = await tool('delete_project', { id: mcpId, dry_run: true });
    expect(preview.isError).toBe(false);
    expect(preview.value).toMatchObject({
      project_id: mcpId,
      task_count: 1,
      open_count: 1,
      deleted: false,
      is_project: true,
      closed: true,
    });
    expect((await prisma.project.findUnique({ where: { id: mcpId } }))?.deletedAt).toBeNull();
  });

  it('deletes an archived project only when the task count matches', async () => {
    const rest = await api()
      .post('/api/v1/projects')
      .send({ name: 'cuenta-rest', is_project: true, outcome: 'Hecho' })
      .expect(201);
    await api().post('/api/v1/tasks').send({ project_id: rest.body.id, title: 'Una' }).expect(201);
    await api()
      .post(`/api/v1/projects/${String(rest.body.id)}/archive`)
      .expect(200);
    const mismatch = await api()
      .delete(`/api/v1/projects/${String(rest.body.id)}?expected_task_count=9`)
      .expect(409);
    expect(mismatch.body.error.code).toBe('confirmation_mismatch');
    await api()
      .delete(`/api/v1/projects/${String(rest.body.id)}?expected_task_count=1`)
      .expect(204);
    expect(
      (await prisma.project.findUnique({ where: { id: String(rest.body.id) } }))?.deletedAt,
    ).not.toBeNull();

    const mcp = await tool('create_project', {
      name: 'cuenta-mcp',
      is_project: true,
      outcome: 'Hecho',
    });
    await api().post('/api/v1/tasks').send({ project_id: mcp.value.id, title: 'Una' }).expect(201);
    await tool('archive_project', { id: mcp.value.id });
    const refused = await tool('delete_project', { id: mcp.value.id, confirm_task_count: 9 });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('confirmation_mismatch');
    const removed = await tool('delete_project', { id: mcp.value.id, confirm_task_count: 1 });
    expect(removed.isError).toBe(false);
    expect(removed.value.deleted).toBe(true);
    expect(
      (await prisma.project.findUnique({ where: { id: String(mcp.value.id) } }))?.deletedAt,
    ).not.toBeNull();
  });

  it('rejects deleting a project that is not archived', async () => {
    const rest = await api()
      .post('/api/v1/projects')
      .send({ name: 'abierto-rest', is_project: true, outcome: 'No' })
      .expect(201);
    const refused = await api()
      .delete(`/api/v1/projects/${String(rest.body.id)}`)
      .expect(409);
    expect(refused.body.error.code).toBe('project_not_archived');
    expect(
      (await prisma.project.findUnique({ where: { id: String(rest.body.id) } }))?.deletedAt,
    ).toBeNull();

    const mcp = await tool('create_project', {
      name: 'abierto-mcp',
      is_project: true,
      outcome: 'No',
    });
    const blocked = await tool('delete_project', { id: mcp.value.id, confirm_task_count: 0 });
    expect(blocked.isError).toBe(true);
    expect(blocked.text).toContain('project_not_archived');
    expect(
      (await prisma.project.findUnique({ where: { id: String(mcp.value.id) } }))?.deletedAt,
    ).toBeNull();
  });

  it('deletes a normal list over REST and MCP', async () => {
    const rest = await api().post('/api/v1/projects').send({ name: 'normal-rest' }).expect(201);
    await api()
      .delete(`/api/v1/projects/${String(rest.body.id)}`)
      .expect(204);
    expect(
      (await prisma.project.findUnique({ where: { id: String(rest.body.id) } }))?.deletedAt,
    ).not.toBeNull();

    const mcp = await tool('create_project', { name: 'normal-mcp' });
    const removed = await tool('delete_project', { id: mcp.value.id, confirm_task_count: 0 });
    expect(removed.isError).toBe(false);
    expect(removed.value.deleted).toBe(true);
    expect(
      (await prisma.project.findUnique({ where: { id: String(mcp.value.id) } }))?.deletedAt,
    ).not.toBeNull();
  });

  it('filters lists by folder, project flag and state', async () => {
    const folder = await api().post('/api/v1/folders').send({ name: 'Filtro' }).expect(201);
    const active = await api()
      .post('/api/v1/projects')
      .send({ name: 'filtro-activo', folder_id: folder.body.id, is_project: true, outcome: 'Si' })
      .expect(201);
    const paused = await api()
      .post('/api/v1/projects')
      .send({
        name: 'filtro-pausa',
        folder_id: folder.body.id,
        is_project: true,
        outcome: 'Pausa',
        project_status: 'paused',
      })
      .expect(201);
    const loose = await api().post('/api/v1/projects').send({ name: 'filtro-suelta' }).expect(201);

    async function same(query: string, args: Record<string, unknown>): Promise<string[]> {
      const rest = await api().get(`/api/v1/projects?limit=100&${query}`).expect(200);
      const viaTool = await tool('list_projects', { limit: 100, ...args });
      expect(viaTool.isError).toBe(false);
      const restIds = idsOf(rest.body as unknown);
      const mcpIds = idsOf(viaTool.value);
      expect(mcpIds).toEqual(restIds);
      return restIds;
    }

    const inFolder = await same(`folder_id=${String(folder.body.id)}`, {
      folder_id: folder.body.id,
    });
    expect(inFolder).toEqual(expect.arrayContaining([active.body.id, paused.body.id]));
    expect(inFolder).not.toContain(loose.body.id);
    const projects = await same('is_project=true', { is_project: true });
    expect(projects).toContain(active.body.id);
    expect(projects).not.toContain(loose.body.id);
    const pausedIds = await same('is_project=true&state=paused', {
      is_project: true,
      state: 'paused',
    });
    expect(pausedIds).toContain(paused.body.id);
    expect(pausedIds).not.toContain(active.body.id);
    const none = await same('folder_id=none', { folder_id: 'none' });
    expect(none).toContain(loose.body.id);
    expect(none).not.toContain(active.body.id);
  });

  it('returns the project kanban with next action, progress and state', async () => {
    const created = await api()
      .post('/api/v1/projects')
      .send({ name: 'kanban-paridad', is_project: true, outcome: 'Avanzar' })
      .expect(201);
    const task = await api()
      .post('/api/v1/tasks')
      .send({
        project_id: created.body.id,
        title: 'Siguiente paso',
        due_date: new Date(Date.now() - 86_400_000).toISOString(),
        is_all_day: true,
      })
      .expect(201);
    const rest = await api().get('/api/v1/projects/overview').expect(200);
    const viaTool = await tool('list_project_overview');
    expect(viaTool.isError).toBe(false);
    expect(viaTool.value).toEqual(rest.body);
    const item = (rest.body.items as { id: string; next_action: { title: string } | null }[]).find(
      (row) => row.id === created.body.id,
    );
    expect(item?.next_action).toMatchObject({ task_id: task.body.id, title: 'Siguiente paso' });
  });

  it('marks projects as reviewed over REST and MCP', async () => {
    const first = await api()
      .post('/api/v1/projects')
      .send({ name: 'revision-rest', is_project: true, outcome: 'Mirar' })
      .expect(201);
    const second = await tool('create_project', {
      name: 'revision-mcp',
      is_project: true,
      outcome: 'Mirar',
    });
    const rest = await api()
      .post('/api/v1/projects/review')
      .send({ ids: [first.body.id] })
      .expect(200);
    expect(rest.body).toEqual({ reviewed: 1 });
    const viaTool = await tool('mark_project_reviewed', { ids: [second.value.id] });
    expect(viaTool.isError).toBe(false);
    expect(viaTool.value).toEqual({ reviewed: 1 });
    expect((await project(String(first.body.id))).project_reviewed_at).toEqual(expect.any(String));
    expect((await project(String(second.value.id))).project_reviewed_at).toEqual(
      expect.any(String),
    );
  });

  it('adds the next action with POST /tasks and create_task', async () => {
    const restProject = await api()
      .post('/api/v1/projects')
      .send({ name: 'accion-rest', is_project: true, outcome: 'Un paso' })
      .expect(201);
    const restTask = await api()
      .post('/api/v1/tasks')
      .send({ project_id: restProject.body.id, title: 'Paso rest' })
      .expect(201);
    const mcpProject = await tool('create_project', {
      name: 'accion-mcp',
      is_project: true,
      outcome: 'Un paso',
    });
    const mcpTask = await tool('create_task', {
      project_id: mcpProject.value.id,
      title: 'Paso mcp',
    });
    expect(mcpTask.isError).toBe(false);
    const fetched = await api()
      .get(`/api/v1/tasks/${String(mcpTask.value.id)}`)
      .expect(200);
    expect(fetched.body.project_id).toBe(mcpProject.value.id);
    expect(fetched.body.title).toBe('Paso mcp');

    const overview = await api().get('/api/v1/projects/overview').expect(200);
    const viaTool = await tool('list_project_overview');
    expect(viaTool.value).toEqual(overview.body);
    const titles = new Map(
      (overview.body.items as { id: string; next_action: { title: string } | null }[]).map(
        (item) => [item.id, item.next_action?.title],
      ),
    );
    expect(titles.get(String(restProject.body.id))).toBe('Paso rest');
    expect(titles.get(String(mcpProject.value.id))).toBe('Paso mcp');
    expect(restTask.body.title).toBe('Paso rest');
  });

  it('reads and updates the work context over REST and MCP', async () => {
    const before = await api().get('/api/v1/me/work-context').expect(200);
    const viaTool = await tool('get_work_context');
    expect(viaTool.isError).toBe(false);
    expect(viaTool.value).toEqual(before.body);

    const folder = await api().post('/api/v1/folders').send({ name: 'Jornada' }).expect(201);
    const patched = await api()
      .patch('/api/v1/me/work-context')
      .send({
        work_days: ['MO', 'TU', 'WE', 'TH', 'FR'],
        work_folder_ids: [folder.body.id],
        work_project_ids: [],
        work_tag_ids: [],
        hide_work_outside_hours: false,
      })
      .expect(200);
    const afterPatch = await tool('get_work_context');
    expect(afterPatch.value).toEqual(patched.body);
    expect(afterPatch.value).toMatchObject({
      work_days: ['MO', 'TU', 'WE', 'TH', 'FR'],
      work_folder_ids: [folder.body.id],
      hide_work_outside_hours: false,
    });

    const updated = await tool('update_work_context', { hide_work_outside_hours: true });
    expect(updated.isError).toBe(false);
    const afterTool = await api().get('/api/v1/me/work-context').expect(200);
    expect(afterTool.body).toEqual(updated.value);
    expect(afterTool.body.hide_work_outside_hours).toBe(true);
  });

  it('shows work from settings while MCP listings stay unfiltered by default', async () => {
    const { workId } = await hideWork('mostrar');
    const shown = await api()
      .patch('/api/v1/me/work-context')
      .send({ show_work: true })
      .expect(200);
    expect(shown.body.work_hidden_now).toBe(false);
    expect(shown.body.show_work_until).toEqual(expect.any(String));
    const auto = await api().get('/api/v1/smart-lists/today/tasks?context=auto').expect(200);
    expect(taskIds(auto.body)).toContain(workId);

    const hidden = await tool('update_work_context', { show_work: false });
    expect(hidden.value.work_hidden_now).toBe(true);
    const again = await api().get('/api/v1/me/work-context').expect(200);
    expect(again.body).toEqual(hidden.value);
    const unfiltered = await tool('list_smart_list_tasks', { key: 'today', limit: 100 });
    expect(unfiltered.isError).toBe(false);
    expect(taskIds(unfiltered.value)).toContain(workId);
    const autoHidden = await api().get('/api/v1/smart-lists/today/tasks?context=auto').expect(200);
    expect(taskIds(autoHidden.body)).not.toContain(workId);
  });

  it('filters work on smart lists, tasks, calendar, day load and the day plan', async () => {
    const { workId, homeId } = await hideWork('vistas');
    const later = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const homeListId = (await projectOf(homeId)).project_id;
    const homeUpcoming = String(
      (
        await api()
          .post('/api/v1/tasks')
          .send({
            title: 'vistas-casa-luego',
            project_id: homeListId,
            due_date: later,
            start_date: later,
          })
          .expect(201)
      ).body.id,
    );
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const today = civilToday();

    async function sameIds(
      restUrl: string,
      name: string,
      args: Record<string, unknown>,
      expected: { present: string[]; absent: string[] },
    ): Promise<void> {
      const rest = await api().get(restUrl).expect(200);
      const viaTool = await tool(name, args);
      expect(viaTool.isError).toBe(false);
      const restIds = taskIds(rest.body);
      const mcpIds = taskIds(viaTool.value);
      const watched = [...expected.present, ...expected.absent, homeUpcoming];
      expect(mcpIds.filter((id) => watched.includes(id)).sort()).toEqual(
        restIds.filter((id) => watched.includes(id)).sort(),
      );
      for (const id of expected.present) expect(mcpIds, id).toContain(id);
      for (const id of expected.absent) expect(mcpIds, id).not.toContain(id);
    }

    await sameIds(
      '/api/v1/tasks?status=active&flat=true&limit=100',
      'list_tasks',
      { status: 'active', limit: 100 },
      {
        present: [workId, homeId],
        absent: [],
      },
    );
    await sameIds(
      '/api/v1/tasks?status=active&flat=true&limit=100&context=work',
      'list_tasks',
      { status: 'active', limit: 100, context: 'work' },
      { present: [workId], absent: [homeId] },
    );
    await sameIds(
      '/api/v1/tasks?status=active&flat=true&limit=100&context=personal',
      'list_tasks',
      { status: 'active', limit: 100, context: 'personal' },
      { present: [homeId], absent: [workId] },
    );
    await sameIds(
      '/api/v1/smart-lists/today/tasks?limit=100',
      'list_smart_list_tasks',
      { key: 'today', limit: 100 },
      {
        present: [workId, homeId],
        absent: [],
      },
    );
    await sameIds(
      '/api/v1/smart-lists/today/tasks?limit=100&context=personal',
      'list_smart_list_tasks',
      { key: 'today', limit: 100, context: 'personal' },
      { present: [homeId], absent: [workId] },
    );
    await sameIds(
      '/api/v1/smart-lists/next_7_days/tasks?limit=100&context=work',
      'list_smart_list_tasks',
      { key: 'next_7_days', limit: 100, context: 'work' },
      { present: [workId], absent: [homeId, homeUpcoming] },
    );
    await sameIds(
      '/api/v1/smart-lists/next_7_days/tasks?limit=100&context=personal',
      'list_smart_list_tasks',
      { key: 'next_7_days', limit: 100, context: 'personal' },
      { present: [homeId, homeUpcoming], absent: [workId] },
    );
    await sameIds(
      `/api/v1/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&context=work`,
      'list_calendar_events',
      { from, to, context: 'work', include_external: false },
      { present: [workId], absent: [homeId] },
    );
    const load = await api()
      .get(`/api/v1/planning/load?date=${today}&time_zone=Europe/Madrid&context=work`)
      .expect(200);
    const loadTool = await tool('get_day_load', { date: today, context: 'work' });
    expect(loadTool.isError).toBe(false);
    expect(taskIds(loadTool.value)).toEqual(taskIds(load.body));
    expect(taskIds(load.body)).toContain(workId);
    expect(taskIds(load.body)).not.toContain(homeId);

    const plan = await prisma.dayPlan.create({
      data: {
        ownerId,
        localDate: '2026-12-15',
        timeZone: 'Europe/Madrid',
        members: {
          create: [
            { taskId: workId, rank: 0, source: 'plan' },
            { taskId: homeId, rank: 1, source: 'plan' },
          ],
        },
      },
    });
    const restPlan = await api()
      .get('/api/v1/plans?date=2026-12-15&time_zone=Europe%2FMadrid')
      .expect(200);
    const open = await tool('get_day_plan', { date: '2026-12-15' });
    expect(open.isError).toBe(false);
    expect(open.value).toEqual(restPlan.body);
    const workPlan = await tool('get_day_plan', { date: '2026-12-15', context: 'work' });
    const personalPlan = await tool('get_day_plan', { date: '2026-12-15', context: 'personal' });
    const memberIds = (value: Record<string, unknown>) =>
      (value.members as { task_id: string }[]).map((member) => member.task_id);
    expect(memberIds(open.value)).toEqual(expect.arrayContaining([workId, homeId]));
    expect(memberIds(workPlan.value)).toEqual([workId]);
    expect(memberIds(personalPlan.value)).toEqual([homeId]);
    expect(plan.localDate).toBe('2026-12-15');
  });

  it('does not hide work tasks when MCP omits context outside working hours', async () => {
    const { workId, homeId } = await hideWork('oculto');
    const restAuto = await api()
      .get('/api/v1/smart-lists/today/tasks?context=auto&limit=100')
      .expect(200);
    expect(taskIds(restAuto.body)).not.toContain(workId);
    expect(taskIds(restAuto.body)).toContain(homeId);
    const unfiltered = await tool('list_smart_list_tasks', { key: 'today', limit: 100 });
    expect(unfiltered.isError).toBe(false);
    expect(taskIds(unfiltered.value)).toEqual(expect.arrayContaining([workId, homeId]));
    const restAll = await api()
      .get('/api/v1/smart-lists/today/tasks?context=all&limit=100')
      .expect(200);
    expect(taskIds(restAll.body)).toEqual(expect.arrayContaining([workId, homeId]));
  });

  it('hides write tools from a read token and overview without lists:read', async () => {
    const names = await toolNames(readerToken);
    for (const name of WRITE_TOOLS) expect(names, name).not.toContain(name);
    expect(names).toEqual(
      expect.arrayContaining([
        'list_folders',
        'list_projects',
        'list_project_overview',
        'list_project_members',
        'get_project_public_link',
        'get_work_context',
      ]),
    );
    expect(names).not.toContain('update_work_context');
    const before = await prisma.folder.count({ where: { ownerId } });
    const refused = await tool('create_folder', { name: 'No' }, readerToken);
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('scope_missing: lists:write');
    expect(await prisma.folder.count({ where: { ownerId } })).toBe(before);
    const work = await tool('update_work_context', { show_work: true }, readerToken);
    expect(work.isError).toBe(true);
    expect(work.text).toContain('scope_missing: workday:write');

    const tasksOnly = await toolNames(tasksOnlyToken);
    expect(tasksOnly).not.toContain('list_project_overview');
    expect(tasksOnly).not.toContain('update_work_context');
    const overview = await tool('list_project_overview', {}, tasksOnlyToken);
    expect(overview.isError).toBe(true);
    expect(overview.text).toContain('scope_missing: lists:read');
  });

  it('lists the new operations in api_catalog', async () => {
    const operations: { method: string; path: string }[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      const listed = await tool('api_catalog', {
        limit: 100,
        ...(cursor === undefined ? {} : { cursor }),
      });
      expect(listed.isError).toBe(false);
      operations.push(...(listed.value.items as { method: string; path: string }[]));
      const next = listed.value.next_cursor;
      if (typeof next !== 'string' || next.length === 0) break;
      cursor = next;
    }
    const has = (method: string, path: string) =>
      operations.some((operation) => operation.method === method && operation.path === path);
    for (const [method, path] of [
      ['GET', '/api/v1/folders'],
      ['POST', '/api/v1/folders'],
      ['PATCH', '/api/v1/folders/{id}'],
      ['DELETE', '/api/v1/folders/{id}'],
      ['GET', '/api/v1/projects'],
      ['POST', '/api/v1/projects'],
      ['PATCH', '/api/v1/projects/{id}'],
      ['POST', '/api/v1/projects/{id}/state'],
      ['POST', '/api/v1/projects/{id}/archive'],
      ['POST', '/api/v1/projects/{id}/unarchive'],
      ['GET', '/api/v1/projects/{id}/deletion-impact'],
      ['DELETE', '/api/v1/projects/{id}'],
      ['GET', '/api/v1/projects/overview'],
      ['POST', '/api/v1/projects/review'],
      ['GET', '/api/v1/me/work-context'],
      ['PATCH', '/api/v1/me/work-context'],
      ['GET', '/api/v1/projects/{id}/members'],
      ['POST', '/api/v1/projects/{id}/members'],
    ] as const) {
      expect(has(method, path), `${method} ${path}`).toBe(true);
    }
  });

  it('shares a list over REST and MCP with the same members', async () => {
    const list = await api().post('/api/v1/projects').send({ name: 'compartida' }).expect(201);
    const projectId = String(list.body.id);
    const active = () => prisma.projectMember.count({ where: { projectId, deletedAt: null } });
    const before = await active();
    const preview = await tool('share_project', {
      id: projectId,
      email: otherEmail,
      permission: 'read',
    });
    expect(preview.isError).toBe(false);
    expect(preview.value).toEqual({
      shared: false,
      preview: {
        list_name: 'compartida',
        task_count: 0,
        email: otherEmail,
        permission: 'read',
        already_member: null,
      },
      hint: 'Call again with confirm=true to share.',
    });
    expect(await active()).toBe(before);
    const confirmed = await tool('share_project', {
      id: projectId,
      email: otherEmail,
      permission: 'read',
      confirm: true,
    });
    expect(confirmed.isError).toBe(false);
    expect(confirmed.value).toMatchObject({
      shared: false,
      status: 'pending',
      permission: 'read',
      changed: 'created',
    });
    const memberId = String(confirmed.value.member_id);
    const viaTool = await tool('list_project_members', { id: projectId });
    const viaRest = await api().get(`/api/v1/projects/${projectId}/members`).expect(200);
    expect(viaTool.isError).toBe(false);
    expect(viaTool.value).toEqual(viaRest.body);
    expect(viaRest.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: memberId, email: otherEmail, permission: 'read' }),
      ]),
    );
    const again = await tool('share_project', {
      id: projectId,
      email: otherEmail,
      permission: 'read',
      confirm: true,
    });
    expect(again.isError).toBe(false);
    expect(again.value).toMatchObject({
      shared: false,
      status: 'pending',
      member_id: memberId,
      changed: 'unchanged',
    });
    expect(await active()).toBe(before + 1);
    const updated = await tool('share_project', {
      id: projectId,
      email: otherEmail,
      permission: 'write',
      confirm: true,
    });
    expect(updated.isError).toBe(false);
    expect(updated.value).toMatchObject({
      shared: false,
      status: 'pending',
      member_id: memberId,
      permission: 'write',
      changed: 'updated',
    });
    const removed = await tool('unshare_project', { id: projectId, member_id: memberId });
    expect(removed.isError).toBe(false);
    expect(removed.value).toEqual({ removed: true, member_id: memberId });
    const after = await api().get(`/api/v1/projects/${projectId}/members`).expect(200);
    expect(after.body.items).toEqual([
      expect.objectContaining({ id: null, role: 'owner', status: 'accepted' }),
    ]);
    const missing = await tool('unshare_project', { id: projectId, member_id: memberId });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('member_not_found');
  });

  it('rejects sharing the inbox, another owner, a foreign token, a list outside the token, and a missing member', async () => {
    const list = await api().post('/api/v1/projects').send({ name: 'privada' }).expect(201);
    const otherList = await api().post('/api/v1/projects').send({ name: 'otra' }).expect(201);
    const projectId = String(list.body.id);
    const stranger = newPersonalAccessToken();
    await prisma.personalAccessToken.create({
      data: {
        ownerId: otherId,
        name: `stranger-${randomUUID()}`,
        tokenHash: stranger.hash,
        tokenPrefix: stranger.prefix,
        scopes: ['lists:read', 'lists:write'],
      },
    });
    const notOwner = await api(stranger.token)
      .post(`/api/v1/projects/${projectId}/members`)
      .send({ email: otherEmail, permission: 'read' });
    expect(notOwner.status).toBe(404);
    expect(notOwner.body.error.code).toBe('project_not_found');

    const inbox = await prisma.project.findFirst({
      where: { ownerId, isInbox: true, deletedAt: null },
    });
    if (inbox === null) {
      throw new Error('inbox missing');
    }
    const inboxShare = await api()
      .post(`/api/v1/projects/${inbox.id}/members`)
      .send({ email: otherEmail, permission: 'read' });
    expect(inboxShare.status).toBe(422);
    expect(inboxShare.body.error.code).toBe('inbox_not_shareable');

    const foreign = newPersonalAccessToken();
    const foreignRow = await prisma.personalAccessToken.create({
      data: {
        ownerId: otherId,
        name: `foreign-${randomUUID()}`,
        tokenHash: foreign.hash,
        tokenPrefix: foreign.prefix,
        scopes: ['lists:read'],
      },
    });
    const foreignToken = await api()
      .post(`/api/v1/projects/${projectId}/members`)
      .send({ token_id: foreignRow.id, permission: 'read' });
    expect(foreignToken.status).toBe(404);
    expect(foreignToken.body.error.code).toBe('token_not_found');

    const limited = newPersonalAccessToken();
    await prisma.personalAccessToken.create({
      data: {
        ownerId,
        name: `limited-${randomUUID()}`,
        tokenHash: limited.hash,
        tokenPrefix: limited.prefix,
        scopes: ['lists:read', 'lists:write'],
        listRestricted: true,
        listIds: [String(otherList.body.id)],
      },
    });
    const outside = await api(limited.token)
      .post(`/api/v1/projects/${projectId}/members`)
      .send({ email: otherEmail, permission: 'read' });
    expect(outside.status).toBe(404);
    expect(outside.body.error.code).toBe('project_not_found');

    const missingMember = await api().delete(
      `/api/v1/projects/${projectId}/members/${randomUUID()}`,
    );
    expect(missingMember.status).toBe(404);
    expect(missingMember.body.error.code).toBe('member_not_found');
  });

  async function projectOf(taskId: string): Promise<{ project_id: string }> {
    const response = await api().get(`/api/v1/tasks/${taskId}`).expect(200);
    return response.body as { project_id: string };
  }

  async function hideWork(
    prefix: string,
  ): Promise<{ workId: string; homeId: string; folderId: string }> {
    const folder = await api()
      .post('/api/v1/folders')
      .send({ name: `${prefix}-carpeta` })
      .expect(201);
    const workList = await api()
      .post('/api/v1/projects')
      .send({ name: `${prefix}-trabajo`, folder_id: folder.body.id })
      .expect(201);
    const homeList = await api()
      .post('/api/v1/projects')
      .send({ name: `${prefix}-casa` })
      .expect(201);
    const due = new Date().toISOString();
    const work = await api()
      .post('/api/v1/tasks')
      .send({
        title: `${prefix}-informe`,
        project_id: workList.body.id,
        due_date: due,
        start_date: due,
      })
      .expect(201);
    const home = await api()
      .post('/api/v1/tasks')
      .send({
        title: `${prefix}-compra`,
        project_id: homeList.body.id,
        due_date: due,
        start_date: due,
      })
      .expect(201);
    const off = weekdayCode(new Date()) === 'SU' ? 'MO' : 'SU';
    await api()
      .patch('/api/v1/me/work-context')
      .send({
        work_days: [off],
        work_folder_ids: [folder.body.id],
        work_project_ids: [],
        work_tag_ids: [],
        hide_work_outside_hours: true,
        show_work: false,
      })
      .expect(200);
    return {
      workId: String(work.body.id),
      homeId: String(home.body.id),
      folderId: String(folder.body.id),
    };
  }
});

function weekdayCode(date: Date): string {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
  }).format(date);
  return (
    { Sun: 'SU', Mon: 'MO', Tue: 'TU', Wed: 'WE', Thu: 'TH', Fri: 'FR', Sat: 'SA' }[label] ?? 'SU'
  );
}

function civilToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
