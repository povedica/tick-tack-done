import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';

type SuperTestApp = Parameters<typeof request>[0];

loadRootEnv();
process.env.AUTH_MODE = 'dev';

const prisma = new PrismaClient();

async function createOwner(name: string): Promise<{ id: string; email: string; inboxId: string }> {
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
  await prisma.idempotencyRecord.deleteMany({ where: { ownerId: id } });
  await prisma.outboxEvent.deleteMany({ where: { ownerId: id } });
  await prisma.activityLog.deleteMany({ where: { ownerId: id } });
  await prisma.personalAccessToken.deleteMany({ where: { ownerId: id } });
  await prisma.filter.deleteMany({ where: { ownerId: id } });
  await prisma.habitLog.deleteMany({ where: { ownerId: id } });
  await prisma.habit.deleteMany({ where: { ownerId: id } });
  await prisma.task.deleteMany({ where: { ownerId: id } });
  await prisma.project.deleteMany({ where: { ownerId: id } });
  await prisma.user.delete({ where: { id } });
}

describe('MCP server', () => {
  let app: INestApplication;
  let server: SuperTestApp;
  let owner: { id: string; email: string; inboxId: string };

  beforeAll(async () => {
    await prisma.$connect();
    owner = await createOwner('mcp');
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

  it('RF-2001: a limited PAT lists, creates and completes tasks and cannot leave its scopes', async () => {
    const created = await request(server)
      .post('/api/v1/me/tokens')
      .set('X-Dev-User-Email', owner.email)
      .send({ name: 'Cursor', scopes: ['tasks:read', 'tasks:write'] })
      .expect(201);
    const bearer = { Authorization: `Bearer ${created.body.token as string}` };

    const init = await rpc(server, bearer, 'initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    });
    expect(init.status).toBe(200);
    expect(init.headers['content-type']).toContain('application/json');
    expect(init.headers['mcp-session-id']).toBeUndefined();
    expect(init.body.result.serverInfo.name).toBe('reflexionia-tasks');
    expect(init.body.result.protocolVersion).toBe('2025-03-26');

    const listed = await rpc(server, bearer, 'tools/list', {});
    const names = (listed.body.result.tools as { name: string }[]).map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(['list_tasks', 'create_task', 'complete_task']));
    expect(names).not.toContain('list_habits');
    expect(names).not.toContain('create_project');

    const devTools = await rpc(server, { 'X-Dev-User-Email': owner.email }, 'tools/list', {});
    expect((devTools.body.result.tools as { name: string }[]).map((tool) => tool.name)).toContain(
      'list_habits',
    );

    const made = await rpc(server, bearer, 'tools/call', {
      name: 'create_task',
      arguments: { title: 'Llamar al cliente', project_id: owner.inboxId },
    });
    const task = JSON.parse(toolText(made.body as unknown)) as {
      id: string;
      title: string;
      status: string;
    };
    expect(made.body.result.isError).toBe(false);
    expect(task.title).toBe('Llamar al cliente');

    const tasks = await rpc(server, bearer, 'tools/call', { name: 'list_tasks', arguments: {} });
    const page = JSON.parse(toolText(tasks.body as unknown)) as { items: { id: string }[] };
    expect(page.items.some((item) => item.id === task.id)).toBe(true);

    const done = await rpc(server, bearer, 'tools/call', {
      name: 'complete_task',
      arguments: { id: task.id },
    });
    const completed = JSON.parse(toolText(done.body as unknown)) as { status: string };
    expect(completed.status).toBe('completed');
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(row.status).toBe('completed');

    const habits = await prisma.habit.count({ where: { ownerId: owner.id } });
    const projects = await prisma.project.count({ where: { ownerId: owner.id } });
    const refused = await rpc(server, bearer, 'tools/call', { name: 'list_habits', arguments: {} });
    expect(refused.body.result.isError).toBe(true);
    expect(toolText(refused.body as unknown)).toContain('scope_missing: habits:read');
    const createHabit = await rpc(server, bearer, 'tools/call', {
      name: 'create_habit',
      arguments: { name: 'Agua' },
    });
    expect(toolText(createHabit.body as unknown)).toContain('scope_missing: habits:write');
    const createList = await rpc(server, bearer, 'tools/call', {
      name: 'create_project',
      arguments: { name: 'Secreto' },
    });
    expect(toolText(createList.body as unknown)).toContain('scope_missing: lists:write');
    expect(await prisma.habit.count({ where: { ownerId: owner.id } })).toBe(habits);
    expect(await prisma.project.count({ where: { ownerId: owner.id } })).toBe(projects);
  });

  it('RF-2001: GET and DELETE stay on POST until a server stream exists', async () => {
    const bearer = await tasksBearer(server, owner.email);

    const get = await request(server)
      .get('/api/v1/mcp')
      .set(bearer)
      .set('Accept', 'text/event-stream');
    expect(get.status).toBe(405);
    expect(get.text).toBe('');
    expect(get.headers.allow).toContain('POST');
    expect(get.headers['mcp-session-id']).toBeUndefined();

    const removed = await request(server).delete('/api/v1/mcp').set(bearer);
    expect(removed.status).toBe(405);
    expect(removed.text).toBe('');
    expect(removed.headers.allow).toContain('POST');
    expect(removed.headers['mcp-session-id']).toBeUndefined();

    const anonymous = await request(server).get('/api/v1/mcp');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('unauthorized');

    const invalid = await request(server)
      .get('/api/v1/mcp')
      .set('Authorization', 'Bearer rfx_pat_not_a_real_token_value');
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.message).toBe('Invalid token');

    const init = await request(server)
      .post('/api/v1/mcp')
      .set(bearer)
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'cursor', version: '0' },
        },
      });
    expect(init.status).toBe(200);
    expect(init.headers['content-type']).toContain('application/json');
    expect(init.headers['mcp-session-id']).toBeUndefined();
    expect(init.body.result.serverInfo.name).toBe('reflexionia-tasks');

    const notice = await request(server).post('/api/v1/mcp').set(bearer).send({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(notice.status).toBe(202);
    expect(notice.text).toBe('');
  });

  it('RF-2001: list_tasks forwards cursor and the next page does not repeat the first', async () => {
    const bearer = await tasksBearer(server, owner.email);
    const created: string[] = [];
    for (const title of ['Página uno', 'Página dos']) {
      const made = await rpc(server, bearer, 'tools/call', {
        name: 'create_task',
        arguments: { title, project_id: owner.inboxId },
      });
      const task = JSON.parse(toolText(made.body as unknown)) as { id: string };
      created.push(task.id);
    }

    const first = await rpc(server, bearer, 'tools/call', {
      name: 'list_tasks',
      arguments: { limit: 1 },
    });
    const page = JSON.parse(toolText(first.body as unknown)) as {
      items: { id: string }[];
      next_cursor: string | null;
    };
    expect(page.items).toHaveLength(1);
    expect(typeof page.next_cursor).toBe('string');
    const firstId = page.items[0]?.id;
    expect(created).toContain(firstId);

    const second = await rpc(server, bearer, 'tools/call', {
      name: 'list_tasks',
      arguments: { limit: 1, cursor: page.next_cursor },
    });
    const next = JSON.parse(toolText(second.body as unknown)) as { items: { id: string }[] };
    expect(next.items.some((item) => item.id === firstId)).toBe(false);
    expect(next.items.length).toBeGreaterThan(0);
  });
});

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

async function tasksBearer(
  server: SuperTestApp,
  email: string,
): Promise<{ Authorization: string }> {
  const created = await request(server)
    .post('/api/v1/me/tokens')
    .set('X-Dev-User-Email', email)
    .send({ name: `Cursor transport ${randomUUID()}`, scopes: ['tasks:read', 'tasks:write'] })
    .expect(201);
  return { Authorization: `Bearer ${created.body.token as string}` };
}

function rpc(
  server: SuperTestApp,
  headers: Record<string, string>,
  method: string,
  params: unknown,
) {
  return request(server)
    .post('/api/v1/mcp')
    .set(headers)
    .send({ jsonrpc: '2.0', id: 1, method, params });
}
