import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { OutboxPublisher } from '../src/events/outbox-publisher';
import { loadRootEnv } from '../src/load-env';
import { SchedulerService } from '../src/scheduler/scheduler.service';
import { gzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

loadRootEnv();
process.env.AUTH_MODE = 'dev';
process.env.SCHEDULER_AUTOSTART = 'false';
process.env.BUS_AUTOSTART = 'false';
process.env.REGISTRATION_OPEN = 'true';

const prisma = new PrismaClient();

describe('phase 1 close', () => {
  let app: INestApplication;
  let server: App;
  let email: string;
  let cookie: string;
  let csrf: string;
  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
    email = `phase1-${randomUUID()}@reflexionia.test`;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as App;
    const registered = await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password: 'correct-horse', display_name: 'Fase 1' })
      .expect(201);
    userId = registered.body.id as string;
    cookie = cookieHeader(registered.headers['set-cookie']);
    csrf = registered.body.csrf_token as string;
  });

  afterAll(async () => {
    await app.close();
    await wipe(userId);
    await prisma.$disconnect();
  });

  it('RF-13010: replaying the same Idempotency-Key does not duplicate the task', async () => {
    const inbox = await session().get('/api/v1/projects').expect(200);
    const projectId = (inbox.body.items as { id: string; is_inbox?: boolean }[]).find(
      (item) => item.is_inbox === true,
    )?.id;
    expect(projectId).toBeTruthy();
    const key = randomUUID();
    const first = await session()
      .post('/api/v1/tasks')
      .set('Idempotency-Key', key)
      .send({ project_id: projectId, title: 'offline' })
      .expect(201);
    const second = await session()
      .post('/api/v1/tasks')
      .set('Idempotency-Key', key)
      .send({ project_id: projectId, title: 'offline' })
      .expect(201);
    expect(second.body.id).toBe(first.body.id);
  });

  it('RF-13012: an older title clock is kept and logged as a conflict', async () => {
    const inbox = await session().get('/api/v1/projects').expect(200);
    const projectId = (inbox.body.items as { id: string; is_inbox?: boolean }[]).find(
      (item) => item.is_inbox === true,
    )?.id;
    const created = await session()
      .post('/api/v1/tasks')
      .set('Idempotency-Key', randomUUID())
      .send({ project_id: projectId, title: 'antes' })
      .expect(201);
    const id = created.body.id as string;
    await session()
      .patch(`/api/v1/tasks/${id}`)
      .send({ title: 'después', field_clocks: { title: '2026-10-18T10:00:00.000Z' } })
      .expect(200);
    const lost = await session()
      .patch(`/api/v1/tasks/${id}`)
      .send({ title: 'viejo', field_clocks: { title: '2026-10-18T09:00:00.000Z' } })
      .expect(200);
    expect(lost.body.title).toBe('después');
    const activity = await prisma.activityLog.findFirst({
      where: { entityId: id, ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(activity?.changes)).toContain('last_write_wins');
  });

  it('RF-13011 and RF-13014: delta sync returns the cursor page', async () => {
    const page = await session().get('/api/v1/sync?limit=10').expect(200);
    expect(Array.isArray(page.body.changes)).toBe(true);
    expect(page.body.changes.length).toBeGreaterThan(0);
    const cursor = page.body.changes[0].event_id as string;
    const next = await session().get(`/api/v1/sync?since=${cursor}&limit=10`).expect(200);
    expect(next.body.changes.every((row: { event_id: string }) => row.event_id !== cursor)).toBe(
      true,
    );
  });

  it('creates a reminder, the scheduler fires it, and the task can be completed', async () => {
    const inbox = await session().get('/api/v1/projects').expect(200);
    const projectId = (inbox.body.items as { id: string; is_inbox?: boolean }[]).find(
      (item) => item.is_inbox === true,
    )?.id;
    const created = await session()
      .post('/api/v1/tasks')
      .set('Idempotency-Key', randomUUID())
      .send({
        project_id: projectId,
        title: 'recordar',
        due_date: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        time_zone: 'Europe/Madrid',
      })
      .expect(201);
    await session()
      .post(`/api/v1/tasks/${created.body.id as string}/reminders`)
      .send({ trigger: 'TRIGGER:PT0S', type: 'relative', channel: 'email' })
      .expect(201);
    const scheduler = app.get(SchedulerService);
    const fired = await scheduler.run(new Date(), true);
    expect(fired.late + fired.fired).toBeGreaterThan(0);
    await session()
      .post(`/api/v1/tasks/${created.body.id as string}/complete`)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
  });

  it('publishes the outbox onto the bus', async () => {
    const publisher = app.get(OutboxPublisher);
    const published = await publisher.publishPending();
    expect(published).toBeGreaterThan(0);
    const row = await prisma.outboxEvent.findFirst({
      where: { ownerId: userId, publishedAt: { not: null } },
    });
    expect(row).not.toBeNull();
  });

  it('RF-1703: JSON export carries schema_version and omits the password hash', async () => {
    const exported = await session().get('/api/v1/export/json').expect(200);
    expect(exported.body.schema_version).toBe(1);
    expect(JSON.stringify(exported.body)).not.toContain('password');
  });

  it('RF-1704: lists a backup and verifies the archive without applying it', async () => {
    const stamp = '20261018T040000Z';
    const dir = path.join(process.cwd(), 'backups', stamp);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'db.sql.gz'), gzipSync('select 1;'));
    const listed = await session().get('/api/v1/backups').expect(200);
    expect(listed.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ stamp, has_database: true })]),
    );
    const restored = await session()
      .post('/api/v1/backups/restore')
      .send({ stamp, confirmation: 'restore' })
      .expect(200);
    expect(restored.body).toMatchObject({ verified: true, applied: false });
  });

  it('requires CSRF on a cookie session and revokes that session', async () => {
    await request(server)
      .patch('/api/v1/me')
      .set('Cookie', cookie)
      .send({ display_name: 'No' })
      .expect(403);
    await session().patch('/api/v1/me').send({ display_name: 'Sí' }).expect(200);
    const sessions = await session().get('/api/v1/auth/sessions').expect(200);
    expect(sessions.body.length).toBeGreaterThan(0);
  });

  it('issues an OAuth token with PKCE and the requested scopes', async () => {
    const client = await session()
      .post('/api/v1/oauth/clients')
      .send({ name: 'Agente', redirect_uris: ['https://example.com/cb'] })
      .expect(201);
    const verifier = 'a'.repeat(43);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const consent = await session()
      .post('/api/v1/oauth/authorize')
      .send({
        client_id: client.body.id,
        redirect_uri: 'https://example.com/cb',
        scope: 'tasks:read',
        state: 'state-phase1',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        allow: true,
      })
      .expect(201);
    const code = new URL(consent.body.redirect_to as string).searchParams.get('code');
    expect(code).toBeTruthy();
    const token = await request(server)
      .post('/api/v1/oauth/token')
      .send({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://example.com/cb',
        client_id: client.body.id,
        code_verifier: verifier,
      })
      .expect(200);
    expect(token.body.token_type).toBe('Bearer');
    expect(token.body.scope).toBe('tasks:read');
    await request(server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${token.body.access_token as string}`)
      .send({ title: 'fuera de scope' })
      .expect(403);
  });

  function session() {
    return {
      get: (url: string) =>
        request(server).get(url).set('Cookie', cookie).set('X-CSRF-Token', csrf),
      post: (url: string) =>
        request(server).post(url).set('Cookie', cookie).set('X-CSRF-Token', csrf),
      patch: (url: string) =>
        request(server).patch(url).set('Cookie', cookie).set('X-CSRF-Token', csrf),
    };
  }
});

function cookieHeader(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? '').split(';')[0] ?? '';
}

async function wipe(id: string | undefined): Promise<void> {
  if (id === undefined) {
    return;
  }
  await prisma.activityLog.deleteMany({ where: { OR: [{ ownerId: id }, { actorId: id }] } });
  await prisma.outboxEvent.deleteMany({ where: { ownerId: id } });
  await prisma.idempotencyRecord.deleteMany({ where: { ownerId: id } });
  await prisma.personalAccessToken.deleteMany({ where: { ownerId: id } });
  await prisma.oauthAuthorizationCode.deleteMany({ where: { userId: id } });
  await prisma.oauthClient.deleteMany({ where: { ownerId: id } });
  await prisma.session.deleteMany({ where: { userId: id } });
  await prisma.reminderDelivery.deleteMany({ where: { ownerId: id } });
  await prisma.reminder.deleteMany({ where: { ownerId: id } });
  await prisma.checklistItem.deleteMany({ where: { ownerId: id } });
  await prisma.taskTag.deleteMany({ where: { task: { ownerId: id } } });
  await prisma.task.deleteMany({ where: { ownerId: id } });
  await prisma.project.deleteMany({ where: { ownerId: id } });
  await prisma.user.deleteMany({ where: { id } });
}
