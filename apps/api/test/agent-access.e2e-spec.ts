import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadRootEnv } from '../src/load-env';
import { SlidingWindowRateLimit, TokenRateLimiter } from '../src/auth/token-rate-limit';

loadRootEnv();
process.env.AUTH_MODE = 'dev';

const prisma = new PrismaClient();

interface Owner {
  id: string;
  email: string;
  inboxId: string;
}

async function createOwner(name: string): Promise<Owner> {
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
  await prisma.habitLog.deleteMany({ where: { ownerId: id } });
  await prisma.habit.deleteMany({ where: { ownerId: id } });
  await prisma.checklistItem.deleteMany({ where: { ownerId: id } });
  await prisma.taskTag.deleteMany({ where: { task: { ownerId: id } } });
  await prisma.task.deleteMany({ where: { ownerId: id } });
  await prisma.project.deleteMany({ where: { ownerId: id } });
  await prisma.user.delete({ where: { id } });
}

function dev(server: App, email: string) {
  const header = { 'X-Dev-User-Email': email };
  return {
    get: (url: string) => request(server).get(url).set(header),
    post: (url: string) => request(server).post(url).set(header),
    delete: (url: string) => request(server).delete(url).set(header),
  };
}

describe('personal access tokens', () => {
  let app: INestApplication;
  let server: App;
  let owner: Owner;
  let other: Owner;

  beforeAll(async () => {
    await prisma.$connect();
    owner = await createOwner('pat');
    other = await createOwner('pat-other');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
    await removeOwner(owner.id);
    await removeOwner(other.id);
    await prisma.$disconnect();
  });

  it('RF-2002: stores only the hash, shows the token once, enforces scopes, and revokes immediately', async () => {
    const api = dev(server, owner.email);
    const created = await api
      .post('/api/v1/me/tokens')
      .send({ name: '  Cursor  ', scopes: ['tasks:write', 'tasks:read', 'tasks:read'] })
      .expect(201);
    expect(created.body.name).toBe('Cursor');
    expect(created.body.scopes).toEqual(['tasks:write', 'tasks:read']);
    expect(created.body.last_used_at).toBeNull();
    expect(created.body.revoked_at).toBeNull();
    const secret = created.body.token as string;
    expect(secret.startsWith('rfx_pat_')).toBe(true);

    const stored = await prisma.personalAccessToken.findUniqueOrThrow({
      where: { id: created.body.id as string },
    });
    expect(stored.tokenHash).toBe(createHash('sha256').update(secret).digest('hex'));
    expect(stored.tokenHash).not.toContain(secret);
    expect(JSON.stringify(stored)).not.toContain(secret);

    const listed = await api.get('/api/v1/me/tokens').expect(200);
    expect(listed.headers['x-ratelimit-limit']).toBeUndefined();
    expect(JSON.stringify(listed.body)).not.toContain(secret);
    expect(listed.body.items[0].token_prefix).toBe(secret.slice(0, 16));

    await api
      .post('/api/v1/me/tokens')
      .send({ name: 'Cursor', scopes: ['tasks:read'] })
      .expect(409);

    const bearer = { Authorization: `Bearer ${secret}` };
    const devAndBearer = { ...bearer, 'X-Dev-User-Email': owner.email };
    const tasks = await request(server).get('/api/v1/tasks').set(bearer).expect(200);
    expect(tasks.headers['x-ratelimit-limit']).toBe('1000');
    expect(tasks.headers['x-ratelimit-remaining']).toBeDefined();
    expect(tasks.headers['x-ratelimit-reset']).toBeDefined();

    const habitsBefore = await prisma.habit.count({ where: { ownerId: owner.id } });
    const denied = await request(server)
      .post('/api/v1/habits')
      .set(devAndBearer)
      .send({})
      .expect(403);
    expect(denied.body.error.code).toBe('scope_missing');
    expect(denied.body.error.details.missing).toContain('habits:write');
    expect(await prisma.habit.count({ where: { ownerId: owner.id } })).toBe(habitsBefore);
    await request(server).get('/api/v1/projects').set(bearer).expect(403);
    await request(server)
      .post('/api/v1/me/tokens')
      .set(bearer)
      .send({ name: 'Otro', scopes: ['tasks:read'] })
      .expect(403);

    const task = await request(server)
      .post('/api/v1/tasks')
      .set(bearer)
      .send({ title: 'Desde el agente', project_id: owner.inboxId })
      .expect(201);
    const event = await prisma.outboxEvent.findFirst({
      where: { ownerId: owner.id, type: 'task.created@v1', actorId: created.body.id as string },
    });
    expect(event?.actorKind).toBe('api');

    const used = await api.get('/api/v1/me/tokens').expect(200);
    expect(used.body.items[0].last_used_at).not.toBeNull();

    const activity = await api.get(`/api/v1/me/tokens/${created.body.id}/activity`).expect(200);
    expect(
      activity.body.items.some(
        (item: { action: string; token_id: string }) =>
          item.action === 'accessed' && item.token_id === created.body.id,
      ),
    ).toBe(true);
    expect(
      activity.body.items.some(
        (item: { action: string; entity_type: string; token_id: string }) =>
          item.action === 'created' &&
          item.entity_type === 'task' &&
          item.token_id === created.body.id,
      ),
    ).toBe(true);
    await dev(server, other.email).get(`/api/v1/me/tokens/${created.body.id}/activity`).expect(404);
    const account = await api.get('/api/v1/me/activity').expect(200);
    expect(
      account.body.items.some(
        (item: { entity_type: string }) => item.entity_type === 'personal_access_token',
      ),
    ).toBe(true);

    await api.delete(`/api/v1/me/tokens/${created.body.id}`).expect(204);
    await request(server).get('/api/v1/tasks').set(bearer).expect(401);
    expect(task.body.id).toEqual(expect.any(String));

    const again = await api
      .post('/api/v1/me/tokens')
      .send({ name: 'Cursor', scopes: ['tasks:read'] })
      .expect(201);
    expect(again.body.token).not.toBe(secret);
    await api
      .post('/api/v1/me/tokens')
      .send({ name: 'Mal', scopes: ['not-a-scope'] })
      .expect(400);
  });
});

describe('token rate limit', () => {
  let app: INestApplication;
  let server: App;
  let owner: Owner;

  beforeAll(async () => {
    await prisma.$connect();
    owner = await createOwner('rate');
    const window = new SlidingWindowRateLimit(2, 15 * 60 * 1000);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TokenRateLimiter)
      .useValue({ consume: (id: string) => window.consume(id) })
      .compile();
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

  it('RF-2002: answers 429 with Retry-After when the token exceeds its window', async () => {
    const created = await dev(server, owner.email)
      .post('/api/v1/me/tokens')
      .send({ name: 'Script', scopes: ['tasks:read'] })
      .expect(201);
    const bearer = { Authorization: `Bearer ${created.body.token as string}` };
    await request(server).get('/api/v1/tasks').set(bearer).expect(200);
    const second = await request(server).get('/api/v1/tasks').set(bearer).expect(200);
    expect(second.headers['x-ratelimit-limit']).toBe('2');
    expect(second.headers['x-ratelimit-remaining']).toBe('0');
    const blocked = await request(server).get('/api/v1/tasks').set(bearer).expect(429);
    expect(blocked.body.error.code).toBe('rate_limited');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.headers['x-ratelimit-remaining']).toBe('0');
  });
});
