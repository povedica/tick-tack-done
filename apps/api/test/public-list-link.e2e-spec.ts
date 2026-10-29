import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { hashPassword } from '../src/auth/passwords.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';

type SuperTestApp = Parameters<typeof request>[0];

loadRootEnv();
process.env.AUTH_MODE = 'dev';

const prisma = new PrismaClient();
const NOT_FOUND = { error: { code: 'not_found', message: 'Not found', details: null } };

describe('public list link', () => {
  let app: INestApplication;
  let server: SuperTestApp;
  let ownerId = '';
  let otherId = '';
  let email = '';
  let otherEmail = '';
  let listId = '';
  let inboxId = '';

  beforeAll(async () => {
    await prisma.$connect();
    email = `public-${randomUUID()}@reflexionia.test`;
    otherEmail = `other-${randomUUID()}@reflexionia.test`;
    const passwordHash = await hashPassword('correct-horse-battery');
    const owner = await prisma.user.create({
      data: { email, displayName: 'Owner', timeZone: 'Europe/Madrid', passwordHash },
    });
    const other = await prisma.user.create({
      data: { email: otherEmail, displayName: 'Other', timeZone: 'Europe/Madrid', passwordHash },
    });
    ownerId = owner.id;
    otherId = other.id;
    const inbox = await prisma.project.create({
      data: { ownerId, name: 'Bandeja', isInbox: true },
    });
    const list = await prisma.project.create({ data: { ownerId, name: 'Viaje' } });
    inboxId = inbox.id;
    listId = list.id;
    await prisma.task.create({
      data: { ownerId, projectId: listId, createdById: ownerId, title: 'Reservar tren' },
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as SuperTestApp;
  });

  afterAll(async () => {
    await app.close();
    await prisma.publicListLink.deleteMany({ where: { ownerId } });
    await prisma.outboxEvent.deleteMany({ where: { ownerId: { in: [ownerId, otherId] } } });
    await prisma.activityLog.deleteMany({ where: { ownerId: { in: [ownerId, otherId] } } });
    await prisma.task.deleteMany({ where: { ownerId } });
    await prisma.project.deleteMany({ where: { ownerId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
    await prisma.$disconnect();
  });

  it('lets anyone with the link read the list and hides the token after revoke', async () => {
    const created = await request(server)
      .post(`/api/v1/projects/${listId}/public-link`)
      .set('X-Dev-User-Email', email)
      .send({})
      .expect(201);
    const token = created.body.token as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await prisma.publicListLink.findFirst({ where: { projectId: listId } });
    expect(stored?.tokenHash).not.toBe(token);

    const open = await request(server).get(`/api/v1/public/lists/${token}`).expect(200);
    expect(open.headers['x-robots-tag']).toContain('noindex');
    expect(open.headers['referrer-policy']).toBe('no-referrer');
    expect(open.headers['cache-control']).toContain('no-store');
    expect(open.headers['access-control-allow-origin']).toBeUndefined();
    expect(JSON.stringify(open.body)).not.toContain(listId);
    expect(open.body.name).toBe('Viaje');
    expect(open.body.tasks[0].title).toBe('Reservar tren');
    expect(open.body.tasks[0].ref).toBe('t1');

    await request(server).get(`/api/v1/projects/${listId}/public-link`).expect(401);
    await request(server)
      .get(`/api/v1/projects/${listId}/public-link`)
      .set('X-Dev-User-Email', otherEmail)
      .expect(404);
    await request(server)
      .post(`/api/v1/projects/${inboxId}/public-link`)
      .set('X-Dev-User-Email', email)
      .send({})
      .expect(422);

    await request(server)
      .delete(`/api/v1/projects/${listId}/public-link`)
      .set('X-Dev-User-Email', email)
      .expect(204);
    const revoked = await request(server).get(`/api/v1/public/lists/${token}`).expect(404);
    const missing = await request(server).get('/api/v1/public/lists/not-a-token').expect(404);
    expect(revoked.body).toEqual(NOT_FOUND);
    expect(missing.body).toEqual(revoked.body);
    expect(revoked.headers['x-robots-tag']).toBe(missing.headers['x-robots-tag']);

    let limited = missing;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      limited = await request(server).get('/api/v1/public/lists/not-a-token');
    }
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('rate_limited');
    expect(limited.headers['retry-after']).toBeDefined();
  });
});
