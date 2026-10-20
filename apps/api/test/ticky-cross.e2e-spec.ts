import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

const cross = process.env.TICKY_CROSS_SERVICE_URL;
const owner = '10000000-0000-4000-8000-000000000001';
const list = '10000000-0000-4000-8000-000000000002';
const token = 'rfx_pat_synthetic_cross_fixture_only';

// Explicit opt-in: requires the isolated Python HTTP fixture and disposable PostgreSQL/Redis.
describe.skipIf(cross === undefined)('APP-03 / TK-022/600 real HTTP compatibility', () => {
  let app: INestApplication | undefined;
  const prisma = new PrismaClient();
  let taskId: string;
  let threadId: string;
  beforeAll(async () => {
    if (process.env.DATABASE_URL?.includes('@postgres:5432/reflexionia') !== true) {
      throw new Error('Disposable cross-repository database required');
    }
    process.env.AUTH_MODE = 'dev';
    process.env.TICKY_SERVICE_URL = cross;
    process.env.TICKY_JWT_PRIVATE_KEY_PEM = readFileSync('/cross-keys/private.pem', 'utf8');
    process.env.TICKY_JWT_KID = 'synthetic-cross';
    process.env.TICKY_READ_ENABLED = 'true';
    process.env.TICKY_MODEL_ENABLED = 'false';
    process.env.TICKY_UI_ENABLED = 'true';
    await prisma.outboxEvent.deleteMany({ where: { ownerId: owner } });
    await prisma.activityLog.deleteMany({ where: { ownerId: owner } });
    await prisma.tickyClientMessage.deleteMany({ where: { ownerId: owner } });
    await prisma.personalAccessToken.deleteMany({ where: { ownerId: owner } });
    await prisma.task.deleteMany({ where: { ownerId: owner } });
    await prisma.project.deleteMany({ where: { ownerId: owner } });
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({
      data: { id: owner, email: 'demo@reflexionia.test', displayName: 'Synthetic' },
    });
    await prisma.project.create({
      data: { id: list, ownerId: owner, name: 'Synthetic', isInbox: true },
    });
    await prisma.tickyAuthority.create({
      data: {
        ownerId: owner,
        version: 1,
        autonomy: 2,
        readEnabled: true,
        lists: { create: { listId: list } },
      },
    });
    await prisma.personalAccessToken.create({
      data: {
        ownerId: owner,
        name: 'synthetic reader',
        tokenHash: createHash('sha256').update(token).digest('hex'),
        tokenPrefix: token.slice(0, 16),
        scopes: ['tasks:read', 'lists:read'],
        listRestricted: true,
        listIds: [list],
      },
    });
    const task = await prisma.task.create({
      data: {
        ownerId: owner,
        projectId: list,
        title: 'Synthetic HTTP task',
        createdById: owner,
        dueDate: new Date(),
      },
    });
    taskId = task.id;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.listen(3000, '0.0.0.0');
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it('registers the canonical Python thread and reads real domain tasks without a model', async () => {
    if (app === undefined) {
      throw new Error('App not started');
    }
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const capabilities = await request(server)
      .get('/api/v1/ticky/capabilities')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(capabilities.body.list_ids).toEqual([list]);
    const tasks = await request(server)
      .get('/api/v1/tasks')
      .query({ project_id: list, limit: 100, status: 'active' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(tasks.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: taskId })]),
    );
    const opened = await request(server)
      .post('/api/v1/ticky/threads')
      .set('X-Dev-User-Email', 'demo@reflexionia.test')
      .send({})
      .expect(201);
    threadId = opened.body.id as string;
    const clientId = randomUUID();
    const admitted = await request(server)
      .post(`/api/v1/ticky/threads/${threadId}/messages`)
      .set('X-Dev-User-Email', 'demo@reflexionia.test')
      .send({ client_message_id: clientId, text: 'Qué tengo hoy' })
      .expect(202);
    const replay = await request(server)
      .post(`/api/v1/ticky/threads/${threadId}/messages`)
      .set('X-Dev-User-Email', 'demo@reflexionia.test')
      .send({ client_message_id: clientId, text: 'Qué tengo hoy' })
      .expect(202);
    expect(replay.body.run_id).toBe(admitted.body.run_id);
    const stream = await request(server)
      .get(`/api/v1/ticky/runs/${String(admitted.body.run_id)}/events`)
      .set('X-Dev-User-Email', 'demo@reflexionia.test')
      .expect(200);
    expect(stream.text).toContain('run.completed');
    expect(stream.text).toContain(taskId);
    expect(stream.text).toContain('Synthetic HTTP task');
    expect(stream.text).toContain('"llm_calls":0');
    if (process.env.TICKY_CROSS_BROWSER_WS !== undefined) {
      await promisify(execFile)(
        'pnpm',
        [
          '--filter',
          'web',
          'exec',
          'playwright',
          'test',
          '--config',
          'playwright.crossrepo.config.ts',
        ],
        { timeout: 120_000 },
      ).catch((error: unknown) => {
        if (
          error !== null &&
          typeof error === 'object' &&
          'stdout' in error &&
          typeof error.stdout === 'string'
        )
          console.log(error.stdout);
        throw error;
      });
    }
    const history = await request(server)
      .get(`/api/v1/ticky/threads/${threadId}/messages`)
      .set('X-Dev-User-Email', 'demo@reflexionia.test')
      .expect(200);
    expect(JSON.stringify(history.body)).toContain(taskId);
    const deleted = await request(server)
      .delete(`/api/v1/ticky/threads/${threadId}`)
      .set('X-Dev-User-Email', 'demo@reflexionia.test')
      .expect(200);
    expect(deleted.body.state).toBe('deleted');
    await request(server)
      .get(`/api/v1/ticky/threads/${threadId}/messages`)
      .set('X-Dev-User-Email', 'demo@reflexionia.test')
      .expect(404);
    const cached = await prisma.tickyClientMessage.findUniqueOrThrow({
      where: { ownerId_clientMessageId: { ownerId: owner, clientMessageId: clientId } },
    });
    expect(cached.response).toEqual({});
  }, 150_000);
});
