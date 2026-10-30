import { fakeDrive } from './helpers/fake-drive.js';
import { sealField } from '../src/security/field-cipher.js';
import type { AddressInfo } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { MCP_TOOLS } from '../src/mcp/mcp.catalog.js';
import { API_SCOPES } from '../src/auth/scopes.js';
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
  await prisma.smartList.deleteMany({ where: { ownerId: id } });
  await prisma.focusSession.deleteMany({ where: { ownerId: id } });
  await prisma.focusSettings.deleteMany({ where: { userId: id } });
  await prisma.planDecision.deleteMany({ where: { session: { ownerId: id } } });
  await prisma.planOperation.deleteMany({ where: { ownerId: id } });
  await prisma.planSession.deleteMany({ where: { ownerId: id } });
  await prisma.dayPlan.deleteMany({ where: { ownerId: id } });
  await prisma.habitLog.deleteMany({ where: { ownerId: id } });
  await prisma.habit.deleteMany({ where: { ownerId: id } });
  await prisma.task.deleteMany({ where: { ownerId: id } });
  await prisma.project.deleteMany({ where: { ownerId: id } });
  await prisma.user.delete({ where: { id } });
}

describe('MCP server', () => {
  let app: INestApplication;
  let server: SuperTestApp;
  const previousPort = process.env.PORT;
  let owner: { id: string; email: string; inboxId: string };

  beforeAll(async () => {
    await prisma.$connect();
    owner = await createOwner('mcp');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    const http = app.getHttpServer() as { address(): AddressInfo };
    process.env.PORT = String(http.address().port);
    server = app.getHttpServer() as SuperTestApp;
  });

  afterAll(async () => {
    await app.close();
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
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

  it('TTD-AUD-102: MCP exposes owned notification settings and precise unlinked test errors', async () => {
    const token = await request(server)
      .post('/api/v1/me/tokens')
      .set('X-Dev-User-Email', owner.email)
      .send({ name: 'Synthetic notification test', scopes: ['profile:read'] })
      .expect(201);
    const headers = { Authorization: `Bearer ${String(token.body.token)}` };
    const settings = await rpc(server, headers, 'tools/call', {
      name: 'get_notification_settings',
      arguments: {},
    });
    expect(settings.body.result.isError).toBe(false);
    expect(JSON.parse(toolText(settings.body as unknown)).preferences).toHaveLength(24);
    const failed = await rpc(server, headers, 'tools/call', {
      name: 'send_test_notification',
      arguments: { channel: 'telegram' },
    });
    expect(failed.body.result.isError).toBe(true);
    expect(toolText(failed.body as unknown)).toContain('telegram_not_configured');
  });

  it('TTD-AUD-101: MCP settings validate and finish atomically starts an opted-in break', async () => {
    const token = await request(server)
      .post('/api/v1/me/tokens')
      .set('X-Dev-User-Email', owner.email)
      .send({ name: 'Synthetic focus settings', scopes: ['focus:read', 'focus:write'] })
      .expect(201);
    const headers = { Authorization: `Bearer ${String(token.body.token)}` };
    const changed = await rpc(server, headers, 'tools/call', {
      name: 'update_focus_settings',
      arguments: {
        pomodoro_minutes: 45,
        auto_start_breaks: true,
        short_break_minutes: 5,
        daily_goal: 8,
        volume: 70,
      },
    });
    expect(changed.body.result.isError).toBe(false);
    const state = await rpc(server, headers, 'tools/call', {
      name: 'get_focus_state',
      arguments: {},
    });
    expect(JSON.parse(toolText(state.body as unknown)).settings).toMatchObject({
      pomodoroMinutes: 45,
      autoStartBreaks: true,
      dailyGoal: 8,
    });
    await request(server)
      .put('/api/v1/focus/settings')
      .set(headers)
      .send({ pomodoro_minutes: 200 })
      .expect(400);
    const session = await request(server)
      .post('/api/v1/focus/sessions')
      .set(headers)
      .send({ planned_minutes: 1 })
      .expect(201);
    await prisma.focusSession.update({
      where: { id: String(session.body.id) },
      data: { startedAt: new Date(Date.now() - 60000) },
    });
    const started = performance.now();
    await request(server)
      .post(`/api/v1/focus/sessions/${String(session.body.id)}/finish`)
      .set(headers)
      .send({})
      .expect(200);
    const active = await prisma.focusSession.findMany({
      where: { ownerId: owner.id, endedAt: null, type: 'short_break' },
    });
    expect(active).toHaveLength(1);
    expect(performance.now() - started).toBeLessThan(1000);
    await request(server)
      .post(`/api/v1/focus/sessions/${String(session.body.id)}/finish`)
      .set(headers)
      .send({})
      .expect(404);
    await request(server)
      .post(`/api/v1/focus/sessions/${String(active[0]?.id)}/abort`)
      .set(headers)
      .expect(200);
    await request(server)
      .put('/api/v1/focus/settings')
      .set(headers)
      .send({ auto_start_breaks: false })
      .expect(200);
  });

  it('TTD-AUD-100: automatic links reconcile and MCP manual links survive text edits', async () => {
    const bearer = await tasksBearer(server, owner.email);
    const call = async (name: string, args: Record<string, unknown>) => {
      const response = await rpc(server, bearer, 'tools/call', { name, arguments: args });
      expect(response.body.result.isError).toBe(false);
      return JSON.parse(toolText(response.body as unknown)) as Record<string, unknown>;
    };
    const task = await call('create_task', { title: 'ver https://example.com/a y www.ttd.dev.' });
    expect(task.links).toHaveLength(2);
    const task_id = task.id;
    const manual = await call('add_task_link', { task_id, url: 'http://169.254.169.254/' });
    expect(manual.title).toBeNull();
    await call('update_task', { id: task_id, title: 'ver https://example.com/a' });
    const detail = await call('get_task', { id: task_id });
    expect(detail.links).toHaveLength(2);
    expect((await call('list_task_links', { task_id })).items).toHaveLength(2);
    await call('remove_task_link', { task_id, link_id: manual.id });
    expect((await call('get_task', { id: task_id })).links).toHaveLength(1);
    await request(server)
      .post(`/api/v1/tasks/${String(task_id)}/links`)
      .set({ 'X-Dev-User-Email': owner.email })
      .send({ url: 'javascript:alert(1)' })
      .expect(400);
    const outsider = await createOwner('links-outsider');
    try {
      await request(server)
        .get(`/api/v1/tasks/${String(task_id)}/links`)
        .set({ 'X-Dev-User-Email': outsider.email })
        .expect(404);
    } finally {
      await removeOwner(outsider.id);
    }
    const list = await request(server)
      .get('/api/v1/tasks')
      .set({ 'X-Dev-User-Email': owner.email })
      .expect(200);
    expect(list.body.items.find((item: { id: string }) => item.id === task_id).link_count).toBe(1);
  });

  it('R80: captures the full tools/list contract with a synthetic owner', async () => {
    const token = await request(server)
      .post('/api/v1/me/tokens')
      .set('X-Dev-User-Email', owner.email)
      .send({ name: 'R80 catalog', scopes: [...API_SCOPES] })
      .expect(201);
    const response = await rpc(
      server,
      { Authorization: `Bearer ${String(token.body.token)}` },
      'tools/list',
      {},
    );
    expect(response.status).toBe(200);
    expect(response.body.result.tools.length).toBeGreaterThanOrEqual(61);
    const phase = process.env.R80_CAPTURE_CATALOG;
    if (phase === 'antes' || phase === 'despues') {
      mkdirSync('../../test-artifacts/audit/r80', { recursive: true });
      writeFileSync(
        `../../test-artifacts/audit/r80/mcp-tools-${phase}.json`,
        JSON.stringify(response.body.result, null, 2) + '\n',
      );
    }
  });

  it('TTD-AUD-85.3: authenticated SSE streams catalog changes without a session', async () => {
    const bearer = await tasksBearer(server, owner.email);

    const abort = new AbortController();
    try {
      const get = await fetch(`http://127.0.0.1:${process.env.PORT}/api/v1/mcp`, {
        headers: { ...bearer, Accept: 'text/event-stream' },
        signal: abort.signal,
      });
      expect(get.status).toBe(200);
      expect(get.headers.get('content-type')).toContain('text/event-stream');
      expect(get.headers.get('mcp-session-id')).toBeNull();
      const chunk = await get.body?.getReader().read();
      expect(new TextDecoder().decode(chunk?.value as Uint8Array | undefined)).toContain(
        'catalog stream',
      );
    } finally {
      abort.abort();
    }
    const fallback = await request(server)
      .get('/api/v1/mcp')
      .set(bearer)
      .set('Accept', 'application/json');
    expect(fallback.status).toBe(405);
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
    const project = await prisma.project.create({
      data: { ownerId: owner.id, name: 'Pagination isolated' },
    });
    const created: string[] = [];
    for (const title of ['Página uno', 'Página dos']) {
      const made = await rpc(server, bearer, 'tools/call', {
        name: 'create_task',
        arguments: { title, project_id: project.id },
      });
      const task = JSON.parse(toolText(made.body as unknown)) as { id: string };
      created.push(task.id);
    }

    const first = await rpc(server, bearer, 'tools/call', {
      name: 'list_tasks',
      arguments: { limit: 1, project_id: project.id },
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
      arguments: { limit: 1, project_id: project.id, cursor: page.next_cursor },
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
      expect(protectedMeta.body.scopes_supported).not.toContain('notifications:self:write');
      expect(
        protectedMeta.body.scopes_supported.some((scope: string) => scope.startsWith('ticky:')),
      ).toBe(false);

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

      const evil = await request(server)
        .post('/api/v1/oauth/register')
        .send({ redirect_uris: ['https://evil.example/cb'], client_name: 'Nope' });
      expect(evil.status).toBe(400);
      expect(evil.body).toEqual({
        error: 'invalid_redirect_uri',
        error_description: 'redirect_uri is not allowed',
      });

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
      expect(plain.status).toBe(302);
      const plainLocation = plain.headers.location;
      if (typeof plainLocation !== 'string') throw new Error('Expected OAuth redirect location');
      const plainRedirect = new URL(plainLocation);
      expect(plainRedirect.origin + plainRedirect.pathname).toBe(redirectUri);
      expect(plainRedirect.searchParams.get('error')).toBe('invalid_request');
      expect(plainRedirect.searchParams.get('state')).toBe('state-oauth-1');

      const unknownClient = await request(server).get('/oauth/authorize').query({
        client_id: '00000000-0000-4000-8000-000000000000',
        redirect_uri: redirectUri,
        state: 'state-oauth-1',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        resource,
      });
      expect(unknownClient.status).toBe(400);
      expect(unknownClient.headers.location).toBeUndefined();

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
      const replay = await request(server)
        .post('/api/v1/oauth/token')
        .send({
          grant_type: 'refresh_token',
          refresh_token: second.body.refresh_token,
          client_id: clientId,
        })
        .expect(200);
      expect(replay.body).toEqual(rotated.body);
      await prisma.oauthRefreshToken.update({
        where: { tokenHash: hashPersonalAccessToken(second.body.refresh_token as string) },
        data: { rotatedAt: new Date(Date.now() - 61_000) },
      });
      const reuse = await request(server).post('/api/v1/oauth/token').send({
        grant_type: 'refresh_token',
        refresh_token: second.body.refresh_token,
        client_id: clientId,
      });
      expect(reuse.status).toBe(400);
      expect(typeof reuse.body.error).toBe('string');
      expect(reuse.body.error).toBe('invalid_grant');
      expect(typeof reuse.body.error_description).toBe('string');

      const badVerifier = await request(server)
        .post('/api/v1/oauth/authorize')
        .set('X-Dev-User-Email', owner.email)
        .send({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: 'tasks:read',
          state: 'state-oauth-3',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          allow: true,
          resource,
        })
        .expect(201);
      const badCode = new URL(badVerifier.body.redirect_to as string).searchParams.get('code');
      const mismatched = await request(server)
        .post('/api/v1/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: badCode,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: 'b'.repeat(43),
          resource,
        });
      expect(mismatched.status).toBe(400);
      expect(mismatched.body).toEqual({
        error: 'invalid_grant',
        error_description: 'PKCE verification failed',
      });

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
  });
  it('TTD-AUD-81: removing recurrence closes every occurrence before two scheduler cycles', async () => {
    const bearer = await tasksBearer(server, owner.email);
    const call = async (name: string, args: Record<string, unknown>) => {
      const response = await rpc(server, bearer, 'tools/call', { name, arguments: args });
      expect(response.body.error).toBeUndefined();
      return JSON.parse(toolText(response.body as unknown)) as Record<string, unknown>;
    };
    const first = await call('create_task', {
      title: 'R80 daily closure',
      due_date: '2026-10-22',
      is_all_day: true,
      recurrence: { freq: 'daily' },
    });
    await call('complete_task', { id: first.id });
    const { SchedulerService } = await import('../src/scheduler/scheduler.service.js');
    const scheduler = app.get(SchedulerService);
    await scheduler.run(new Date(), false);
    const second = await prisma.task.findFirstOrThrow({
      where: { seriesId: String(first.series_id), ownerId: owner.id, status: 'active' },
    });
    await call('update_task', { id: second.id, recurrence: null });
    await scheduler.run(new Date(), false);
    await scheduler.run(new Date(), false);
    expect(
      await prisma.task.count({ where: { ownerId: owner.id, title: 'R80 daily closure' } }),
    ).toBe(2);
    expect(
      await prisma.task.count({
        where: { ownerId: owner.id, seriesId: String(first.series_id), recurrenceOpen: true },
      }),
    ).toBe(0);
    expect(
      await prisma.outboxEvent.count({ where: { ownerId: owner.id, type: 'series.closed@v1' } }),
    ).toBe(1);
  });
  it('TTD-AUD-81: all-day next_occurrence agrees with the series successor', async () => {
    const bearer = await tasksBearer(server, owner.email);
    const made = await rpc(server, bearer, 'tools/call', {
      name: 'create_task',
      arguments: {
        title: 'R80 all day',
        due_date: '2026-10-22',
        is_all_day: true,
        recurrence: { freq: 'daily' },
      },
    });
    const first = JSON.parse(toolText(made.body as unknown)) as { id: string };
    const done = await rpc(server, bearer, 'tools/call', {
      name: 'complete_task',
      arguments: { id: first.id },
    });
    const body = JSON.parse(toolText(done.body as unknown)) as {
      next_occurrence: string;
      series: { next_due_date: string };
    };
    expect(body.next_occurrence).toBe(body.series.next_due_date);
    expect(body.next_occurrence).toBe('2026-10-22T22:00:00.000Z');
  });
  it('TTD-AUD-81: warns when a Tuesday anchor does not match BYDAY=MO', async () => {
    const bearer = await tasksBearer(server, owner.email);
    const made = await rpc(server, bearer, 'tools/call', {
      name: 'create_task',
      arguments: {
        title: 'R80 Monday anchor',
        due_date: '2026-10-20',
        is_all_day: true,
        recurrence: { freq: 'weekly', weekdays: ['MO'] },
      },
    });
    const body = JSON.parse(toolText(made.body as unknown)) as { warnings: unknown[] };
    expect(body.warnings).toContainEqual({
      code: 'anchor_outside_rule',
      next_matching: '2026-10-26',
    });
  });
  it('TTD-AUD-82: parsed lists resolve without creation and update moves the task', async () => {
    const bearer = await tasksBearer(server, owner.email);
    const list = await prisma.project.create({ data: { ownerId: owner.id, name: 'Grókbot' } });
    const call = async (name: string, args: Record<string, unknown>) =>
      JSON.parse(
        toolText(
          (await rpc(server, bearer, 'tools/call', { name, arguments: args })).body as unknown,
        ),
      ) as Record<string, unknown>;
    const known = await call('create_task', { title: 'Llamar ^grokbot', parse: true });
    expect(known.project_id).toBe(list.id);
    const missing = await call('create_task', { title: 'Llamar ^NoExisteR80', parse: true });
    expect(missing.project_id).toBe(owner.inboxId);
    expect(missing.warnings).toContainEqual({ code: 'list_not_found', name: 'NoExisteR80' });
    expect(await prisma.project.count({ where: { ownerId: owner.id, name: 'NoExisteR80' } })).toBe(
      0,
    );
    const moved = await call('update_task', {
      id: missing.id,
      title: 'Actualizar ^GROKBOT',
      parse: true,
    });
    expect(moved.project_id).toBe(list.id);
  });
  it('TTD-AUD-82: completes a pending checklist only after an explicit decision', async () => {
    const bearer = await tasksBearer(server, owner.email);
    const made = await rpc(server, bearer, 'tools/call', {
      name: 'create_task',
      arguments: { title: 'R80 checklist decision' },
    });
    const task = JSON.parse(toolText(made.body as unknown)) as { id: string };
    await rpc(server, bearer, 'tools/call', {
      name: 'add_checklist_item',
      arguments: { task_id: task.id, title: 'Pending' },
    });
    const refused = await rpc(server, bearer, 'tools/call', {
      name: 'complete_task',
      arguments: { id: task.id },
    });
    expect(refused.body.result).toMatchObject({
      isError: true,
      data: { pending_checklist: 1, pending_children: 0, hint: 'retry with complete_children' },
    });
    const completed = await rpc(server, bearer, 'tools/call', {
      name: 'complete_task',
      arguments: { id: task.id, complete_children: 'complete' },
    });
    expect(JSON.parse(toolText(completed.body as unknown))).toMatchObject({
      status: 'completed',
      checklist_progress: { completed: 1, total: 1 },
    });
  });
  it('TTD-AUD-82: cancelled tasks reopen and active tasks reject another reopen', async () => {
    const bearer = await tasksBearer(server, owner.email);
    const task = await prisma.task.create({
      data: {
        ownerId: owner.id,
        projectId: owner.inboxId,
        createdById: owner.id,
        title: 'R80 reopen cancelled',
        status: 'cancelled',
      },
    });
    const opened = await rpc(server, bearer, 'tools/call', {
      name: 'reopen_task',
      arguments: { id: task.id },
    });
    expect(JSON.parse(toolText(opened.body as unknown))).toMatchObject({ status: 'active' });
    expect(
      await prisma.outboxEvent.count({ where: { ownerId: owner.id, type: 'task.reopened@v1' } }),
    ).toBeGreaterThan(0);
    const again = await rpc(server, bearer, 'tools/call', {
      name: 'reopen_task',
      arguments: { id: task.id },
    });
    expect(toolText(again.body as unknown)).toContain('not_reopenable');
  });
  it('TTD-AUD-82: reparents and detaches children, rejects cycles and cross-list parents', async () => {
    const bearer = await tasksBearer(server, owner.email);
    const first = await prisma.task.create({
      data: {
        ownerId: owner.id,
        projectId: owner.inboxId,
        createdById: owner.id,
        title: 'R80 parent',
      },
    });
    const second = await prisma.task.create({
      data: {
        ownerId: owner.id,
        projectId: owner.inboxId,
        createdById: owner.id,
        title: 'R80 child',
      },
    });
    const call = (args: Record<string, unknown>) =>
      rpc(server, bearer, 'tools/call', { name: 'update_task', arguments: args });
    const child = await call({ id: second.id, parent_id: first.id });
    expect(JSON.parse(toolText(child.body as unknown))).toMatchObject({ parent_id: first.id });
    expect(
      toolText((await call({ id: first.id, parent_id: second.id })).body as unknown),
    ).toContain('invalid_parent');
    expect(
      JSON.parse(toolText((await call({ id: second.id, parent_id: null })).body as unknown)),
    ).toMatchObject({ parent_id: null });
    const otherList = await prisma.project.create({
      data: { ownerId: owner.id, name: 'R80 other' },
    });
    const other = await prisma.task.create({
      data: {
        ownerId: owner.id,
        projectId: otherList.id,
        createdById: owner.id,
        title: 'Other parent',
      },
    });
    expect(
      toolText((await call({ id: second.id, parent_id: other.id })).body as unknown),
    ).toContain('invalid_parent');
  });
  it('TTD-AUD-83: inclusive civil-date ranges include all-day and intersecting intervals', async () => {
    const bearer = await tasksBearer(server, owner.email);
    const allDay = await prisma.task.create({
      data: {
        ownerId: owner.id,
        projectId: owner.inboxId,
        createdById: owner.id,
        title: 'R80 all-day range',
        dueDate: new Date('2026-10-21T22:00:00Z'),
        isAllDay: true,
      },
    });
    const spanning = await prisma.task.create({
      data: {
        ownerId: owner.id,
        projectId: owner.inboxId,
        createdById: owner.id,
        title: 'R80 spanning',
        startDate: new Date('2026-10-22T08:00:00Z'),
        dueDate: new Date('2026-10-25T08:00:00Z'),
      },
    });
    const range = async (from: string, field: string) => {
      const response = await rpc(server, bearer, 'tools/call', {
        name: 'list_tasks',
        arguments: { from, to: '2026-10-23', range_field: field, limit: 100 },
      });
      expect(response.body.result.isError).toBe(false);
      return (
        JSON.parse(toolText(response.body as unknown)) as { items: { id: string }[] }
      ).items.map((task) => task.id);
    };
    expect(await range('2026-10-22', 'any')).toEqual(
      expect.arrayContaining([allDay.id, spanning.id]),
    );
    expect(await range('2026-10-22T00:00:00+02:00', 'any')).toContain(allDay.id);
    expect(await range('2026-10-22', 'due')).not.toContain(spanning.id);
  });
  it('TTD-AUD-83: search and catalog use opaque non-repeating pages', async () => {
    const bearer = await tasksBearer(server, owner.email);
    for (let i = 0; i < 5; i++)
      await prisma.task.create({
        data: {
          ownerId: owner.id,
          projectId: owner.inboxId,
          createdById: owner.id,
          title: `r80paginationneedle ${i}`,
        },
      });
    for (const [name, args] of [
      ['search', { q: 'r80paginationneedle' }],
      ['api_catalog', {}],
    ] as const) {
      const first = await rpc(server, bearer, 'tools/call', {
        name,
        arguments: { ...args, limit: 2 },
      });
      const page = JSON.parse(toolText(first.body as unknown)) as {
        items: { id?: string; path?: string }[];
        next_cursor: string;
      };
      expect(typeof page.next_cursor).toBe('string');
      expect(page.items).toHaveLength(2);
      const second = await rpc(server, bearer, 'tools/call', {
        name,
        arguments: { ...args, limit: 2, cursor: page.next_cursor },
      });
      const next = JSON.parse(toolText(second.body as unknown)) as {
        items: { id?: string; path?: string }[];
      };
      expect(next.items).toHaveLength(2);
      expect(
        next.items
          .map((item) => JSON.stringify(item))
          .some((item) => page.items.some((previous) => JSON.stringify(previous) === item)),
      ).toBe(false);
    }
  });
  it('TTD-AUD-83: every list_* returns items and next_cursor', async () => {
    const token = await request(server)
      .post('/api/v1/me/tokens')
      .set('X-Dev-User-Email', owner.email)
      .send({ name: 'R80 list contract', scopes: [...API_SCOPES] })
      .expect(201);
    const bearer = { Authorization: `Bearer ${String(token.body.token)}` };
    const task = await prisma.task.create({
      data: {
        ownerId: owner.id,
        projectId: owner.inboxId,
        createdById: owner.id,
        title: 'R80 list contract',
      },
    });
    const filter = await prisma.filter.create({
      data: {
        ownerId: owner.id,
        name: 'R80 list contract',
        mode: 'normal',
        rules: {
          combinator: 'AND',
          groups: [
            {
              combinator: 'AND',
              conditions: [{ field: 'keyword', op: 'contains', value: 'R80 list contract' }],
            },
          ],
        },
      },
    });
    for (const tool of MCP_TOOLS.filter(
      (tool) =>
        tool.name.startsWith('list_') &&
        tool.name !== 'list_project_members' &&
        tool.name !== 'list_share_invitations',
    )) {
      const required = tool.inputSchema.required ?? [];
      const candidates: Record<string, unknown> = {
        task_id: task.id,
        id: tool.name === 'list_filter_tasks' ? filter.id : task.id,
        key: 'today',
        from: '2026-10-22T00:00:00Z',
        to: '2026-10-23T00:00:00Z',
      };
      const args = Object.fromEntries(required.map((key) => [key, candidates[key]]));
      const response = await rpc(server, bearer, 'tools/call', {
        name: tool.name,
        arguments: { ...args, limit: 2 },
      });
      expect(response.body.result.isError, tool.name).toBe(false);
      const page = JSON.parse(toolText(response.body as unknown)) as Record<string, unknown>;
      if (tool.name === 'list_filter_tasks') {
        expect(Array.isArray(page.groups), tool.name).toBe(true);
        expect(page, tool.name).toHaveProperty('next_cursor');
        continue;
      }
      expect(Array.isArray(page.items), tool.name).toBe(true);
      expect(page, tool.name).toHaveProperty('next_cursor');
    }
  });
  it('TTD-AUD-84: MCP controls an owned focus session through the public API', async () => {
    const token = await request(server)
      .post('/api/v1/me/tokens')
      .set('X-Dev-User-Email', owner.email)
      .send({ name: 'R80 focus', scopes: ['tasks:read', 'focus:read', 'focus:write'] })
      .expect(201);
    const bearer = { Authorization: `Bearer ${String(token.body.token)}` };
    const task = await prisma.task.create({
      data: {
        ownerId: owner.id,
        projectId: owner.inboxId,
        createdById: owner.id,
        title: 'R80 focused task',
      },
    });
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const response = await rpc(server, bearer, 'tools/call', { name, arguments: args });
      expect(response.body.result.isError).toBe(false);
      return JSON.parse(toolText(response.body as unknown)) as Record<string, unknown>;
    };
    await prisma.focusSession.create({
      data: {
        ownerId: owner.id,
        type: 'focus',
        plannedMinutes: 25,
        startedAt: new Date(Date.now() - 86_400_000),
      },
    });
    const started = await call('start_focus', { task_id: task.id, type: 'pomodoro', minutes: 25 });
    expect(started.task_id).toBe(task.id);
    const rejected = await rpc(server, bearer, 'tools/call', {
      name: 'start_focus',
      arguments: {},
    });
    expect(rejected.body.result).toMatchObject({
      isError: true,
      data: { status: 409, session_id: started.id },
    });
    const paused = await call('pause_focus');
    expect(paused.paused_at).not.toBeNull();
    const resumed = await call('resume_focus');
    expect(resumed.paused_at).toBeNull();
    await prisma.focusSession.update({
      where: { id: String(started.id) },
      data: { startedAt: new Date(Date.now() - 28_000), pausedSeconds: 0 },
    });
    const done = await call('finish_focus', { note: 'Synthetic completion note' });
    expect(done.elapsed_seconds).toBeGreaterThanOrEqual(28);
    expect(Number(done.elapsed_seconds)).toBeLessThanOrEqual(29);
    const state = await call('get_focus_state');
    expect(state.session).toBeNull();
    expect(state).toHaveProperty('settings');
    expect(state).toHaveProperty('today');
    const stopwatch = await call('start_focus', { type: 'stopwatch', task_id: task.id });
    expect(stopwatch.type).toBe('stopwatch');
    const aborted = await call('abort_focus');
    expect(aborted.completed).toBe(false);
    expect(aborted.ended_at).not.toBeNull();
  });
  it('TTD-AUD-85.1: api_request keeps a real task_not_found HTTP error', async () => {
    const bearer = await tasksBearer(server, owner.email);
    const response = await rpc(server, bearer, 'tools/call', {
      name: 'api_request',
      arguments: { method: 'GET', path: `/api/v1/tasks/${randomUUID()}` },
    });
    expect(response.body.result).toMatchObject({
      isError: true,
      data: { status: 404, code: 'task_not_found', message: 'Task was not found' },
    });
  });
  it('TTD-AUD-85.2: reopened, restored and detached activities retain MCP source and actor', async () => {
    const created = await request(server)
      .post('/api/v1/me/tokens')
      .set('X-Dev-User-Email', owner.email)
      .send({ name: 'R80 activities', scopes: [...API_SCOPES] })
      .expect(201);
    const bearer = { Authorization: `Bearer ${String(created.body.token)}` };
    const call = async (name: string, args: Record<string, unknown>) => {
      const response = await rpc(server, bearer, 'tools/call', { name, arguments: args });
      expect(response.body.result.isError).toBe(false);
      return JSON.parse(toolText(response.body as unknown)) as Record<string, unknown>;
    };
    const task = await call('create_task', {
      title: 'R80 source recurrence',
      due_date: '2026-10-22',
      is_all_day: true,
      recurrence: { freq: 'daily' },
    });
    await call('cancel_task', { id: task.id });
    await call('reopen_task', { id: task.id });
    await call('delete_task', { id: task.id });
    await call('restore_task', { id: task.id });
    const detached = await call('detach_occurrence', {
      id: task.id,
      due_date: '2026-10-21T22:00:00.000Z',
    });
    expect(detached.source).toBe('mcp');
    const detail = await call('get_task', { id: task.id });
    const activity = detail.activity as { type: string; source: string; actor: unknown }[];
    for (const type of ['task.reopened', 'task.restored', 'occurrence.detached'])
      expect(activity).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type, source: 'mcp', actor: expect.any(Object) }),
        ]),
      );
  });
  it('TTD-AUD-85.4: empty replans create nothing and an owned draft can be discarded', async () => {
    const empty = await createOwner('r80-empty-replan');
    try {
      const bearer = await tasksBearer(server, empty.email);
      const response = await rpc(server, bearer, 'tools/call', {
        name: 'replan_day',
        arguments: { auto_apply: false },
      });
      expect(JSON.parse(toolText(response.body as unknown))).toMatchObject({
        session: null,
        reason: 'nothing_to_replan',
      });
      expect(await prisma.planSession.count({ where: { ownerId: empty.id } })).toBe(0);
      await prisma.task.create({
        data: {
          ownerId: empty.id,
          projectId: empty.inboxId,
          createdById: empty.id,
          title: 'Overdue for replan',
          dueDate: new Date('2026-01-01T00:00:00Z'),
        },
      });
      const proposed = await rpc(server, bearer, 'tools/call', {
        name: 'replan_day',
        arguments: { auto_apply: false },
      });
      expect(proposed.body).not.toHaveProperty('result.isError', true);
      const draft = JSON.parse(toolText(proposed.body as unknown)) as { id: string };
      expect(draft).toHaveProperty('id');
      const discarded = await rpc(server, bearer, 'tools/call', {
        name: 'discard_replan',
        arguments: { session_id: draft.id },
      });
      expect(JSON.parse(toolText(discarded.body as unknown))).toMatchObject({ discarded: true });
      expect((await prisma.planSession.findUniqueOrThrow({ where: { id: draft.id } })).state).toBe(
        'discarded',
      );
    } finally {
      await removeOwner(empty.id);
    }
  });
  it('TTD-AUD-85.5: reminder trigger inputs store the same canonical duration', async () => {
    const token = await request(server)
      .post('/api/v1/me/tokens')
      .set('X-Dev-User-Email', owner.email)
      .send({ name: 'R80 reminders', scopes: [...API_SCOPES] })
      .expect(201);
    const bearer = { Authorization: `Bearer ${String(token.body.token)}` };
    const task = await prisma.task.create({
      data: {
        ownerId: owner.id,
        projectId: owner.inboxId,
        createdById: owner.id,
        title: 'R80 canonical trigger',
        dueDate: new Date('2026-10-23T10:00:00Z'),
      },
    });
    for (const trigger of ['TRIGGER:-PT15M', '-PT15M']) {
      const response = await rpc(server, bearer, 'tools/call', {
        name: 'add_task_reminder',
        arguments: { task_id: task.id, trigger, type: 'relative' },
      });
      expect(response.body.result.isError).toBe(false);
      expect(JSON.parse(toolText(response.body as unknown))).toMatchObject({ trigger: '-PT15M' });
    }
  });
  it('TTD-AUD-85.7/85.8: ranges expose their end and four updates stay under 2 KB', async () => {
    const bearer = await tasksBearer(server, owner.email);
    const quick = await rpc(server, bearer, 'tools/call', {
      name: 'quick_add',
      arguments: { text: 'R80 range mañana 17:00-17:45' },
    });
    const task = JSON.parse(toolText(quick.body as unknown)) as {
      id: string;
      start_date: string;
      due_date: string;
      duration_minutes: number;
    };
    expect(Date.parse(task.due_date) - Date.parse(task.start_date)).toBe(45 * 60_000);
    expect(task.duration_minutes).toBe(45);
    for (let i = 0; i < 4; i++)
      await rpc(server, bearer, 'tools/call', {
        name: 'update_task',
        arguments: { id: task.id, title: `R80 small update ${i}` },
      });
    const updated = await rpc(server, bearer, 'tools/call', {
      name: 'update_task',
      arguments: { id: task.id, priority: 'high' },
    });
    expect(Buffer.byteLength(toolText(updated.body as unknown))).toBeLessThan(2048);
    const full = await rpc(server, bearer, 'tools/call', {
      name: 'get_task',
      arguments: { id: task.id, include_activity: 'full' },
    });
    expect(JSON.parse(toolText(full.body as unknown))).toHaveProperty('activity.0.changes');
  });

  it('TTD-AUD-99: MCP links, lists and removes metadata without deleting the Drive file', async () => {
    const google = await fakeDrive();
    const previousId = process.env.GOOGLE_CLIENT_ID;
    const previousSecret = process.env.GOOGLE_CLIENT_SECRET;
    process.env.GOOGLE_CLIENT_ID = 'synthetic';
    process.env.GOOGLE_CLIENT_SECRET = 'synthetic';
    try {
      await prisma.user.update({
        where: { id: owner.id },
        data: {
          googleRefreshToken: sealField('synthetic-refresh'),
          googleGrantedScopes: [
            'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/drive.file',
          ],
          googleCalendarEnabled: true,
          googleDriveEnabled: true,
          googleStatus: 'connected',
        },
      });
      const task = await prisma.task.create({
        data: {
          ownerId: owner.id,
          projectId: owner.inboxId,
          createdById: owner.id,
          title: 'MCP Drive metadata',
        },
      });
      google.files.set('mcp-file', {
        id: 'mcp-file',
        name: 'report.txt',
        mimeType: 'text/plain',
        parents: [],
        size: '4',
        webViewLink: 'https://drive.google.com/file/d/mcp-file/view',
        appProperties: {},
      });
      const bearer = await tasksBearer(server, owner.email);
      const linked = await rpc(server, bearer, 'tools/call', {
        name: 'link_drive_file',
        arguments: { task_id: task.id, drive_file_id: 'mcp-file' },
      });
      expect(linked.body).not.toHaveProperty('result.isError', true);
      const attachment = JSON.parse(toolText(linked.body as unknown)) as { id: string };
      expect(attachment).toHaveProperty('id');
      const listed = await rpc(server, bearer, 'tools/call', {
        name: 'list_task_attachments',
        arguments: { task_id: task.id },
      });
      expect(JSON.parse(toolText(listed.body as unknown))).toMatchObject({
        items: [
          {
            web_view_link: 'https://drive.google.com/file/d/mcp-file/view',
            source: 'mcp',
            drive_state: 'ok',
          },
        ],
        next_cursor: null,
      });
      const removed = await rpc(server, bearer, 'tools/call', {
        name: 'remove_task_attachment',
        arguments: { task_id: task.id, attachment_id: attachment.id },
      });
      expect(removed.body).not.toHaveProperty('result.isError', true);
      expect(google.files.get('mcp-file')?.trashed).not.toBe(true);
      await prisma.attachment.deleteMany({ where: { taskId: task.id } });
    } finally {
      await prisma.user.update({
        where: { id: owner.id },
        data: { googleRefreshToken: null, googleStatus: 'disconnected' },
      });
      if (previousId === undefined) delete process.env.GOOGLE_CLIENT_ID;
      else process.env.GOOGLE_CLIENT_ID = previousId;
      if (previousSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
      else process.env.GOOGLE_CLIENT_SECRET = previousSecret;
      await google.close();
    }
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
