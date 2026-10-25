import { fakeDrive } from './helpers/fake-drive.js';
import { captureSettings } from '@reflexionia/domain';
import { sealField } from '../src/security/field-cipher.js';
import { rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { newPersonalAccessToken } from '../src/auth/token-secret.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

process.env.AUTH_MODE = 'dev';
process.env.ATTACHMENT_DIR = `/tmp/mcp-api-attachments-${randomUUID()}`;
const db = new PrismaService();
let app: INestApplication;
const oldPort = process.env.PORT;
beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  process.env.PORT = new URL(await app.getUrl()).port;
});
afterAll(async () => {
  if (oldPort === undefined) delete process.env.PORT;
  else process.env.PORT = oldPort;
  await app.close();
  await rm(process.env.ATTACHMENT_DIR ?? '', { recursive: true, force: true });
  await db.$disconnect();
});

it('RF-2001: generic MCP API transport re-enters bearer scope checks', async () => {
  const owner = await db.user.create({
    data: { email: `mcp-api-${randomUUID()}@reflexionia.test`, displayName: 'MCP API' },
  });
  const secret = newPersonalAccessToken();
  await db.personalAccessToken.create({
    data: {
      ownerId: owner.id,
      name: 'read-only',
      tokenHash: secret.hash,
      tokenPrefix: secret.prefix,
      scopes: ['tasks:read'],
    },
  });
  const invoke = (args: Record<string, unknown>) =>
    request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/api/v1/mcp')
      .set('Authorization', `Bearer ${secret.token}`)
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'api_request', arguments: args },
      });
  try {
    const allowed = await invoke({ method: 'GET', path: '/api/v1/tasks' }).expect(200);
    expect(allowed.body.result.isError).toBe(false);
    const denied = await invoke({
      method: 'PATCH',
      path: '/api/v1/focus/settings',
      body: { pomodoro_minutes: 15 },
    }).expect(200);
    expect(denied.body.result.isError).toBe(true);
    expect(JSON.stringify(denied.body.result)).toContain('scope_missing');
    expect(await db.focusSettings.count({ where: { userId: owner.id } })).toBe(0);
    const recursive = await invoke({ method: 'GET', path: '/api/v1/mcp' }).expect(200);
    expect(recursive.body.result.isError).toBe(true);
    await db.project.create({ data: { ownerId: owner.id, name: 'Bandeja', isInbox: true } });
    const writer = newPersonalAccessToken();
    await db.personalAccessToken.create({
      data: {
        ownerId: owner.id,
        name: 'writer',
        tokenHash: writer.hash,
        tokenPrefix: writer.prefix,
        scopes: ['tasks:read', 'tasks:write'],
      },
    });
    const capture = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/api/v1/mcp')
      .set('Authorization', `Bearer ${writer.token}`)
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'api_request',
          arguments: {
            method: 'POST',
            path: '/api/v1/tasks',
            body: { raw_text: 'Prueba sintaxis mañana 09:00-09:30 !alta' },
          },
        },
      })
      .expect(200);
    expect(capture.body.result.isError).toBe(false);
    const parsed = JSON.parse(String(capture.body.result.content[0].text)) as {
      data: Record<string, unknown>;
    };
    expect(parsed.data).toMatchObject({
      title: 'Prueba sintaxis',
      duration_minutes: 30,
      priority: 'high',
      is_all_day: false,
    });
    const writerCall = async (args: Record<string, unknown>) => {
      const reply = await request(app.getHttpServer() as Parameters<typeof request>[0])
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${writer.token}`)
        .send({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'api_request', arguments: args },
        })
        .expect(200);
      expect(reply.body.result.isError).toBe(false);
      return JSON.parse(String(reply.body.result.content[0].text)) as {
        data: Record<string, unknown>;
      };
    };
    const google = await fakeDrive();
    process.env.GOOGLE_CLIENT_ID = 'synthetic';
    process.env.GOOGLE_CLIENT_SECRET = 'synthetic';
    await db.user.update({
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
    const base = `/api/v1/tasks/${String(parsed.data.id)}/attachments`;
    const upload = await writerCall({
      method: 'POST',
      path: base,
      files: [
        {
          field: 'file',
          filename: 'nota.txt',
          content_type: 'text/plain',
          base64: Buffer.from('hola MCP').toString('base64'),
        },
      ],
    });
    expect(upload.data).toMatchObject({ source: 'mcp', byte_size: 8 });
    const listed = await writerCall({ method: 'GET', path: base });
    expect(listed.data).toMatchObject({
      items: [{ id: upload.data.id, source: 'mcp', drive_state: 'ok' }],
    });
    await google.close();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  } finally {
    await db.activityLog.deleteMany({ where: { ownerId: owner.id } });
    await db.outboxEvent.deleteMany({ where: { ownerId: owner.id } });
    await db.attachment.deleteMany({ where: { ownerId: owner.id } });
    await db.driveFolder.deleteMany({ where: { userId: owner.id } });
    await db.task.deleteMany({ where: { ownerId: owner.id } });
    await db.project.deleteMany({ where: { ownerId: owner.id } });
    await db.personalAccessToken.deleteMany({ where: { ownerId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
  }
});

it('RF-102/RF-2001: MCP reads, updates and applies owner capture defaults with scoped public transport', async () => {
  const owner = await db.user.create({
    data: { email: `mcp-capture-${randomUUID()}@reflexionia.test`, displayName: 'MCP capture' },
  });
  const inbox = await db.project.create({
    data: { ownerId: owner.id, name: 'Bandeja', isInbox: true },
  });
  const list = await db.project.create({ data: { ownerId: owner.id, name: 'Capturas' } });
  const secret = newPersonalAccessToken();
  const reader = newPersonalAccessToken();
  await db.personalAccessToken.create({
    data: {
      ownerId: owner.id,
      name: 'capture writer',
      tokenHash: secret.hash,
      tokenPrefix: secret.prefix,
      scopes: ['profile:read', 'profile:write', 'tasks:read', 'tasks:write'],
    },
  });
  await db.personalAccessToken.create({
    data: {
      ownerId: owner.id,
      name: 'capture reader',
      tokenHash: reader.hash,
      tokenPrefix: reader.prefix,
      scopes: ['profile:read'],
    },
  });
  const invoke = (name: string, args: Record<string, unknown>, token = secret.token) =>
    request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/api/v1/mcp')
      .set('Authorization', `Bearer ${token}`)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  function data(response: request.Response) {
    expect(response.body.result.isError, JSON.stringify(response.body.result)).toBe(false);
    return JSON.parse(String(response.body.result.content[0].text)) as Record<string, unknown>;
  }
  try {
    const settings = {
      ...captureSettings(null),
      default_list_id: list.id,
      default_priority: 'high',
      default_duration_minutes: 30,
      new_task_position: 'top',
    };
    expect(data(await invoke('get_capture_settings', {}).expect(200))).toMatchObject({
      default_priority: 'none',
    });
    const denied = await invoke('update_capture_settings', { settings }, reader.token).expect(200);
    expect(denied.body.result.isError).toBe(true);
    expect(data(await invoke('update_capture_settings', { settings }).expect(200))).toEqual(
      settings,
    );
    expect(data(await invoke('get_capture_settings', {}, reader.token).expect(200))).toEqual(
      settings,
    );
    const raw = data(await invoke('quick_add', { text: 'Captura MCP' }).expect(200));
    expect(raw).toMatchObject({ project_id: list.id, priority: 'high', duration_minutes: 30 });
    const plain = data(await invoke('create_task', { title: 'Creación MCP' }).expect(200));
    expect(plain).toMatchObject({ project_id: list.id, priority: 'high', duration_minutes: 30 });
    expect(BigInt(String(plain.sort_order))).toBeLessThan(BigInt(String(raw.sort_order)));
    expect(
      data(
        await invoke('create_task', {
          title: 'Explícita',
          project_id: inbox.id,
          priority: 'low',
          duration_minutes: null,
        }).expect(200),
      ),
    ).toMatchObject({ project_id: inbox.id, priority: 'low', duration_minutes: null });
  } finally {
    await db.activityLog.deleteMany({ where: { ownerId: owner.id } });
    await db.outboxEvent.deleteMany({ where: { ownerId: owner.id } });
    await db.task.deleteMany({ where: { ownerId: owner.id } });
    await db.project.deleteMany({ where: { ownerId: owner.id } });
    await db.personalAccessToken.deleteMany({ where: { ownerId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
  }
});
