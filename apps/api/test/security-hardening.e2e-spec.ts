import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { hashPassword } from '../src/auth/passwords.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';
import { isPublicOperation } from '../src/security/public-operations.js';

type SuperTestApp = Parameters<typeof request>[0];

loadRootEnv();
process.env.AUTH_MODE = 'dev';

const prisma = new PrismaClient();

describe('security hardening', () => {
  let app: INestApplication;
  let server: SuperTestApp;
  let ownerId = '';
  let email = '';

  beforeAll(async () => {
    await prisma.$connect();
    email = `sec-${randomUUID()}@reflexionia.test`;
    const user = await prisma.user.create({
      data: {
        email,
        displayName: 'Security',
        timeZone: 'Europe/Madrid',
        passwordHash: await hashPassword('correct-horse-battery'),
      },
    });
    ownerId = user.id;
    await prisma.project.create({ data: { ownerId, name: 'Bandeja', isInbox: true } });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as SuperTestApp;
  });

  afterAll(async () => {
    await app.close();
    await prisma.outboxEvent.deleteMany({ where: { ownerId } });
    await prisma.activityLog.deleteMany({ where: { ownerId } });
    await prisma.session.deleteMany({ where: { userId: ownerId } });
    await prisma.personalAccessToken.deleteMany({ where: { ownerId } });
    await prisma.task.deleteMany({ where: { ownerId } });
    await prisma.project.deleteMany({ where: { ownerId } });
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it('S-17: OpenAPI operations are authenticated unless they are on the public list', () => {
    const document = JSON.parse(readFileSync(path.join(process.cwd(), 'openapi.json'), 'utf8')) as {
      paths: Record<string, Partial<Record<string, { security?: { bearer: string[] }[] }>>>;
    };
    for (const [path, item] of Object.entries(document.paths)) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
        const operation = item[method];
        if (operation === undefined) {
          continue;
        }
        const security = operation.security ?? [];
        if (isPublicOperation(method, path)) {
          expect(security).toEqual([]);
        } else {
          expect(security).toEqual([{ bearer: [] }]);
        }
      }
    }
  });

  it('S-17: health is public and tasks require authentication', async () => {
    await request(server).get('/api/v1/health').expect(200);
    const previous = process.env.AUTH_MODE;
    delete process.env.AUTH_MODE;
    const denied = await request(server).get('/api/v1/tasks').expect(401);
    if (previous === undefined) {
      delete process.env.AUTH_MODE;
    } else {
      process.env.AUTH_MODE = previous;
    }
    expect(denied.body.error.message).toBe('Authentication required');
  });

  it('S-01: the eleventh failed login is 429 with Retry-After', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({ email, password: 'wrong-password' });
      expect(response.status).toBe(401);
    }
    const blocked = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrong-password' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    const logged = await prisma.activityLog.count({
      where: { ownerId, action: 'accessed', entityType: 'session' },
    });
    expect(logged).toBeGreaterThan(0);
  });

  it('S-15 and S-16: a PAT cannot administer tokens, delete the account, or list sessions', async () => {
    const dev = { 'X-Dev-User-Email': email };
    const created = await request(server)
      .post('/api/v1/me/tokens')
      .set(dev)
      .send({ name: 'sec-pw', scopes: ['profile:write'] })
      .expect(201);
    const secret = created.body.token as string;
    const bearer = { Authorization: `Bearer ${secret}` };
    const escalate = await request(server)
      .post('/api/v1/me/tokens')
      .set(bearer)
      .send({ name: 'escalated', scopes: ['tasks:read', 'backup:read'] })
      .expect(403);
    expect(['scope_missing', 'session_required']).toContain(escalate.body.error.code);
    await request(server)
      .delete('/api/v1/me')
      .set(bearer)
      .send({ confirmation: email, password: 'correct-horse-battery' })
      .expect(403);

    const reader = await request(server)
      .post('/api/v1/me/tokens')
      .set(dev)
      .send({ name: 'sec-ro', scopes: ['tasks:read'] })
      .expect(201);
    const readBearer = { Authorization: `Bearer ${reader.body.token as string}` };
    await request(server).get('/api/v1/auth/sessions').set(readBearer).expect(403);

    await prisma.outboxEvent.create({
      data: {
        ownerId,
        type: 'session.created@v1',
        actorKind: 'user',
        actorId: ownerId,
        data: { session: { id: ownerId } },
      },
    });
    await prisma.outboxEvent.create({
      data: {
        ownerId,
        type: 'task.created@v1',
        actorKind: 'user',
        actorId: ownerId,
        data: { task: { id: ownerId } },
      },
    });
    const sync = await request(server).get('/api/v1/sync').set(readBearer).expect(200);
    const types = (sync.body.changes as { type: string }[]).map((change) => change.type);
    expect(types).toContain('task.created@v1');
    expect(types).not.toContain('session.created@v1');

    const task = await request(server)
      .post('/api/v1/tasks')
      .set(readBearer)
      .send({
        title: 'Visible',
        project_id: (await prisma.project.findFirstOrThrow({ where: { ownerId } })).id,
      });
    expect(task.status).toBe(403);
    const writer = await request(server)
      .post('/api/v1/me/tokens')
      .set(dev)
      .send({ name: 'sec-tw', scopes: ['tasks:write', 'tasks:read'] })
      .expect(201);
    const written = await request(server)
      .post('/api/v1/tasks')
      .set({ Authorization: `Bearer ${writer.body.token as string}` })
      .send({
        title: 'Lista secreta',
        project_id: (await prisma.project.findFirstOrThrow({ where: { ownerId } })).id,
      })
      .expect(201);
    await prisma.project.create({ data: { ownerId, name: 'Lista secreta' } });
    const found = await request(server)
      .get('/api/v1/search')
      .query({ q: 'secreta' })
      .set(readBearer)
      .expect(200);
    const groups = (found.body.groups as { type: string }[]).map((group) => group.type);
    expect(groups.every((group) => group === 'task')).toBe(true);
    expect(written.body.id).toBeDefined();
  });

  it('S-19: an invalid project id is 400', async () => {
    const dev = { 'X-Dev-User-Email': email };
    const response = await request(server).get('/api/v1/tasks').query({ project_id: 'x' }).set(dev);
    expect(response.status).toBe(400);
  });
});
