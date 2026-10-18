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
  let server: App;
  let owner: { id: string; email: string; inboxId: string };

  beforeAll(async () => {
    await prisma.$connect();
    owner = await createOwner('mcp');
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

function rpc(server: App, headers: Record<string, string>, method: string, params: unknown) {
  return request(server)
    .post('/api/v1/mcp')
    .set(headers)
    .send({ jsonrpc: '2.0', id: 1, method, params });
}
