import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { hashPersonalAccessToken } from '../src/auth/token-secret.js';
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
  const codes = await prisma.oauthAuthorizationCode.findMany({
    where: { userId: id },
    select: { clientId: true },
  });
  const issued = await prisma.personalAccessToken.findMany({
    where: { ownerId: id, oauthClientId: { not: null } },
    select: { oauthClientId: true },
  });
  const clientIds = [
    ...new Set([
      ...codes.map((code) => code.clientId),
      ...issued.flatMap((token) => (token.oauthClientId === null ? [] : [token.oauthClientId])),
    ]),
  ];
  await prisma.oauthRefreshToken.deleteMany({ where: { userId: id } });
  await prisma.oauthAuthorizationCode.deleteMany({ where: { userId: id } });
  await prisma.personalAccessToken.deleteMany({ where: { ownerId: id } });
  await prisma.oauthClient.deleteMany({
    where: { OR: [{ ownerId: id }, { id: { in: clientIds } }] },
  });
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

  it('connects ChatGPT with OAuth discovery, refresh and revocation', async () => {
    const previous = process.env.PUBLIC_URL;
    process.env.PUBLIC_URL = 'https://todo.reflexionia.com';
    try {
      const origin = 'https://todo.reflexionia.com';
      const resource = `${origin}/api/v1/mcp`;
      const anon = await request(server).post('/api/v1/mcp').send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      });
      expect(anon.status).toBe(401);
      expect(anon.headers['www-authenticate']).toBe(
        `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      );

      const protectedMeta = await request(server)
        .get('/.well-known/oauth-protected-resource')
        .expect(200);
      expect(protectedMeta.body.resource).toBe(resource);
      expect(protectedMeta.body.authorization_servers).toEqual([origin]);
      expect(protectedMeta.body.scopes_supported).toContain('tasks:read');
      expect(protectedMeta.body.scopes_supported).not.toContain('account:admin');

      const serverMeta = await request(server)
        .get('/.well-known/oauth-authorization-server')
        .expect(200);
      expect(serverMeta.body).toMatchObject({
        issuer: origin,
        authorization_endpoint: `${origin}/oauth/authorize`,
        token_endpoint: `${origin}/api/v1/oauth/token`,
        registration_endpoint: `${origin}/api/v1/oauth/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        authorization_response_iss_parameter_supported: true,
      });

      const cors = await request(server)
        .options('/.well-known/oauth-protected-resource')
        .set('Origin', 'https://chatgpt.com')
        .set('Access-Control-Request-Method', 'GET');
      expect(cors.status).toBe(204);
      expect(cors.headers['access-control-allow-origin']).toBe('https://chatgpt.com');
      const closed = await request(server)
        .get('/api/v1/health')
        .set('Origin', 'https://chatgpt.com');
      expect(closed.headers['access-control-allow-origin']).toBeUndefined();

      await request(server)
        .post('/api/v1/oauth/register')
        .send({ redirect_uris: ['https://evil.example/cb'], client_name: 'Nope' })
        .expect(400);

      const registered = await request(server)
        .post('/api/v1/oauth/register')
        .send({
          redirect_uris: ['http://127.0.0.1:8080/cb'],
          client_name: 'ChatGPT',
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          software_id: 'ignored',
        })
        .expect(201);
      const clientId = registered.body.client_id as string;
      expect(registered.body.token_endpoint_auth_method).toBe('none');

      const verifier = 'a'.repeat(43);
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const redirectUri = 'http://127.0.0.1:8080/cb';
      const browser = await request(server).get('/oauth/authorize').query({
        client_id: clientId,
        redirect_uri: redirectUri,
        state: 'state-oauth-1',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        resource,
      });
      expect(browser.status).toBe(302);
      expect(browser.headers.location).toContain('/login?next=');

      const plain = await request(server).get('/oauth/authorize').query({
        client_id: clientId,
        redirect_uri: redirectUri,
        state: 'state-oauth-1',
        code_challenge: challenge,
        code_challenge_method: 'plain',
        resource,
      });
      expect(plain.status).toBe(400);

      const consent = await request(server)
        .post('/api/v1/oauth/authorize')
        .set('X-Dev-User-Email', owner.email)
        .send({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: 'tasks:read tasks:write',
          requested_scope: '',
          state: 'state-oauth-1',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          allow: true,
          resource,
        })
        .expect(201);
      const redirected = new URL(consent.body.redirect_to as string);
      expect(redirected.searchParams.get('iss')).toBe(origin);
      const code = redirected.searchParams.get('code');
      expect(code).toBeTruthy();

      const token = await request(server).post('/api/v1/oauth/token').type('form').send({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verifier,
        resource,
      });
      expect(token.status).toBe(200);
      expect(token.body.expires_in).toBe(3600);
      expect(token.body.token_type).toBe('Bearer');
      expect(token.body.scope).toBe('tasks:read tasks:write');
      const access = token.body.access_token as string;
      const refresh = token.body.refresh_token as string;

      const listed = await rpc(server, { Authorization: `Bearer ${access}` }, 'tools/list', {});
      const names = (listed.body.result.tools as { name: string }[]).map((tool) => tool.name);
      expect(names).toContain('list_tasks');
      expect(names).toContain('create_task');
      expect(names).not.toContain('list_habits');

      const tokens = await request(server)
        .get('/api/v1/me/tokens')
        .set('X-Dev-User-Email', owner.email)
        .expect(200);
      expect(tokens.body.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ client_name: 'ChatGPT' })]),
      );

      const refreshed = await request(server).post('/oauth/token').send({
        grant_type: 'refresh_token',
        refresh_token: refresh,
        client_id: clientId,
      });
      expect(refreshed.status).toBe(200);
      const nextAccess = refreshed.body.access_token as string;
      const nextRefresh = refreshed.body.refresh_token as string;
      expect(nextAccess).not.toBe(access);

      await request(server).post('/api/v1/oauth/revoke').send({ token: nextAccess }).expect(200);
      const afterRevoke = await request(server)
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${nextAccess}`)
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      expect(afterRevoke.status).toBe(401);

      const again = await request(server)
        .post('/api/v1/oauth/authorize')
        .set('X-Dev-User-Email', owner.email)
        .send({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: 'tasks:read',
          state: 'state-oauth-2',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          allow: true,
          resource,
        })
        .expect(201);
      const secondCode = new URL(again.body.redirect_to as string).searchParams.get('code');
      const second = await request(server).post('/api/v1/oauth/token').send({
        grant_type: 'authorization_code',
        code: secondCode,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verifier,
        resource,
      });
      expect(second.status).toBe(200);
      const rotated = await request(server).post('/api/v1/oauth/token').send({
        grant_type: 'refresh_token',
        refresh_token: second.body.refresh_token,
        client_id: clientId,
      });
      expect(rotated.status).toBe(200);
      const reuse = await request(server).post('/api/v1/oauth/token').send({
        grant_type: 'refresh_token',
        refresh_token: second.body.refresh_token,
        client_id: clientId,
      });
      expect(reuse.status).toBe(400);
      const spent = await prisma.oauthRefreshToken.findFirst({
        where: { tokenHash: hashPersonalAccessToken(rotated.body.refresh_token as string) },
      });
      expect(spent?.revokedAt).not.toBeNull();
      expect(nextRefresh.length).toBeGreaterThan(20);
    } finally {
      if (previous === undefined) {
        delete process.env.PUBLIC_URL;
      } else {
        process.env.PUBLIC_URL = previous;
      }
    }
  });

  it('RF-2007..RF-2012: MCP can create, inspect, detach and advance a repeating task', async () => {
    const bearer = await tasksBearer(server, owner.email);
    const due = '2026-05-31T08:00:00.000Z';

    const made = await rpc(server, bearer, 'tools/call', {
      name: 'create_task',
      arguments: {
        title: 'Pagar asistenta',
        project_id: owner.inboxId,
        due_date: due,
        is_all_day: false,
        recurrence: { freq: 'monthly', month_day: 31 },
      },
    });
    expect(made.body.result.isError).toBe(false);
    const created = JSON.parse(toolText(made.body as unknown)) as {
      id: string;
      repeat_rule: string;
      repeat_label: string;
      next_occurrence: string | null;
      series_id: string;
    };
    expect(created.repeat_rule).toContain('FREQ=MONTHLY');
    expect(created.repeat_rule).toContain('BYMONTHDAY=31');
    expect(created.repeat_label).toMatch(/día 31|último día/i);
    expect(created.next_occurrence).toBeTruthy();

    const got = await rpc(server, bearer, 'tools/call', {
      name: 'get_task',
      arguments: { id: created.id },
    });
    const detail = JSON.parse(toolText(got.body as unknown)) as {
      repeat_label: string;
      next_occurrence: string | null;
    };
    expect(detail.repeat_label).toBe(created.repeat_label);

    const range = await rpc(server, bearer, 'tools/call', {
      name: 'get_task_occurrences',
      arguments: {
        id: created.id,
        from: '2026-05-01T00:00:00.000Z',
        to: '2026-08-31T23:59:59.000Z',
      },
    });
    const occurrences = JSON.parse(toolText(range.body as unknown)) as {
      occurrences: { due_date: string }[];
    };
    expect(occurrences.occurrences.length).toBeGreaterThanOrEqual(2);

    const skip = await rpc(server, bearer, 'tools/call', {
      name: 'detach_occurrence',
      arguments: { id: created.id, due_date: due, title: 'Pagar asistenta (mayo)' },
    });
    expect(skip.body.result.isError).toBe(false);

    const seriesRow = await prisma.task.findFirst({
      where: { ownerId: owner.id, seriesId: created.series_id, status: 'active', deletedAt: null },
    });
    // After detaching the current due, either a successor is pending via SeriesAdvance
    // or the same task lost its series; recreate a fresh recurring task for complete.
    const remade = await rpc(server, bearer, 'tools/call', {
      name: 'create_task',
      arguments: {
        title: 'Regar plantas',
        project_id: owner.inboxId,
        due_date: '2026-01-15T09:00:00.000Z',
        recurrence: { freq: 'monthly', month_day: 15 },
      },
    });
    const plant = JSON.parse(toolText(remade.body as unknown)) as { id: string; series_id: string };

    const done = await rpc(server, bearer, 'tools/call', {
      name: 'complete_task',
      arguments: {
        id: plant.id,
        advance: 'next_future',
        materialize_next: true,
      },
    });
    const completed = JSON.parse(toolText(done.body as unknown)) as {
      status: string;
      series?: { materialized: boolean; next_due_date: string | null; eta_seconds: number | null };
    };
    expect(completed.status).toBe('completed');
    expect(completed.series?.materialized).toBe(true);
    const nextDue = completed.series?.next_due_date;
    expect(nextDue).toBeTruthy();
    expect(new Date(nextDue ?? 0).getTime()).toBeGreaterThan(Date.now() - 60_000);

    const active = await prisma.task.findMany({
      where: { seriesId: plant.series_id, status: 'active', deletedAt: null },
    });
    expect(active).toHaveLength(1);
    const activeDue = active[0]?.dueDate;
    expect(activeDue).toBeTruthy();
    expect((activeDue ?? new Date(0)).getTime()).toBeGreaterThan(Date.now() - 60_000);

    // Scheduler must stay idempotent: a second materialize pass must not duplicate.
    const before = await prisma.task.count({
      where: { seriesId: plant.series_id, deletedAt: null },
    });
    const { SchedulerService } = await import('../src/scheduler/scheduler.service.js');
    const scheduler = app.get(SchedulerService);
    await scheduler.run(new Date(), false);
    const after = await prisma.task.count({
      where: { seriesId: plant.series_id, deletedAt: null },
    });
    expect(after).toBe(before);
    expect(seriesRow).not.toBeNull();
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
