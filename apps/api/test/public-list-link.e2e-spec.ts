import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { hashPassword } from '../src/auth/passwords.js';
import { newPersonalAccessToken } from '../src/auth/token-secret.js';
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
  let writerId = '';
  let email = '';
  let otherEmail = '';
  let writerEmail = '';
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
    writerEmail = `writer-${randomUUID()}@reflexionia.test`;
    const writer = await prisma.user.create({
      data: { email: writerEmail, displayName: 'Writer', timeZone: 'Europe/Madrid', passwordHash },
    });
    ownerId = owner.id;
    otherId = other.id;
    writerId = writer.id;
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
    const owners = [ownerId, otherId, writerId];
    await prisma.shareNotice.deleteMany({ where: { userId: { in: owners } } });
    await prisma.publicListLink.deleteMany({ where: { ownerId } });
    await prisma.outboxEvent.deleteMany({ where: { ownerId: { in: owners } } });
    await prisma.activityLog.deleteMany({
      where: { OR: [{ ownerId: { in: owners } }, { actorId: { in: owners } }] },
    });
    await prisma.personalAccessToken.deleteMany({ where: { ownerId: { in: owners } } });
    await prisma.task.deleteMany({ where: { ownerId } });
    await prisma.project.deleteMany({ where: { ownerId } });
    await prisma.smartList.deleteMany({ where: { ownerId: { in: owners } } });
    await prisma.user.deleteMany({ where: { id: { in: owners } } });
    await prisma.$disconnect();
  });

  it('COMP-29: a write member gets 403 and a token limited to another list gets 404', async () => {
    await prisma.projectMember.create({
      data: {
        ownerId,
        projectId: listId,
        memberId: writerId,
        permission: 'write',
        status: 'accepted',
      },
    });
    const denied = await request(server)
      .post(`/api/v1/projects/${listId}/public-link`)
      .set('X-Dev-User-Email', writerEmail)
      .send({})
      .expect(403);
    expect(denied.body.error.code).toBe('forbidden');

    const elsewhere = await prisma.project.create({ data: { ownerId, name: 'Otra' } });
    const limited = newPersonalAccessToken();
    await prisma.personalAccessToken.create({
      data: {
        ownerId,
        name: `limited-${randomUUID()}`,
        tokenHash: limited.hash,
        tokenPrefix: limited.prefix,
        scopes: ['lists:read', 'lists:write'],
        listRestricted: true,
        listIds: [elsewhere.id],
      },
    });
    const hidden = await request(server)
      .get(`/api/v1/projects/${listId}/public-link`)
      .set('Authorization', `Bearer ${limited.token}`)
      .expect(404);
    expect(hidden.body.error.code).toBe('project_not_found');
  });

  it('COMP-29: include_notes false leaves notes null', async () => {
    const notes = await prisma.project.create({ data: { ownerId, name: 'Notas' } });
    await prisma.task.create({
      data: {
        ownerId,
        projectId: notes.id,
        createdById: ownerId,
        title: 'Comprar',
        content: 'leche entera',
      },
    });
    const created = await request(server)
      .post(`/api/v1/projects/${notes.id}/public-link`)
      .set('X-Dev-User-Email', email)
      .send({ include_notes: false })
      .expect(201);
    const body = await request(server)
      .get(`/api/v1/public/lists/${created.body.token as string}`)
      .expect(200);
    expect(body.body.tasks[0].notes).toBeNull();
    expect(JSON.stringify(body.body)).not.toContain('leche entera');
  });

  it('COMP-29: a seeded list does not leak private fields', async () => {
    const seeded = await prisma.project.create({ data: { ownerId, name: 'Semilla' } });
    const task = await prisma.task.create({
      data: {
        ownerId,
        projectId: seeded.id,
        createdById: ownerId,
        title: 'Preparar',
        content: 'lista visible',
        assigneeId: writerId,
      },
    });
    await prisma.comment.create({
      data: { ownerId, taskId: task.id, authorId: ownerId, body: 'nota privada' },
    });
    await prisma.projectMember.create({
      data: {
        ownerId,
        projectId: seeded.id,
        memberId: writerId,
        permission: 'read',
        status: 'accepted',
        inviteEmail: writerEmail,
      },
    });
    await prisma.attachment.create({
      data: {
        ownerId,
        taskId: task.id,
        fileName: 'foto.png',
        mimeType: 'image/png',
        byteSize: 12,
        driveFileId: `drive-${randomUUID()}`,
        webViewLink: 'https://example.test/file',
        uploadedById: ownerId,
      },
    });
    await prisma.taskLink.create({
      data: { ownerId, taskId: task.id, url: 'https://example.test/place', source: 'manual' },
    });
    await prisma.reminder.create({
      data: { ownerId, taskId: task.id, trigger: '-PT15M', type: 'relative' },
    });
    await prisma.listPresence.create({
      data: { projectId: seeded.id, userId: ownerId, seenAt: new Date() },
    });
    const created = await request(server)
      .post(`/api/v1/projects/${seeded.id}/public-link`)
      .set('X-Dev-User-Email', email)
      .send({})
      .expect(201);
    const body = await request(server)
      .get(`/api/v1/public/lists/${created.body.token as string}`)
      .expect(200);
    const encoded = JSON.stringify(body.body);
    expect(encoded).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(encoded).not.toContain('@');
    expect(encoded).not.toContain(writerEmail);
    for (const key of [
      'comment',
      'assignee',
      'member',
      'attachment',
      'owner',
      'activity',
      'presence',
    ]) {
      expect(encoded).not.toContain(`"${key}"`);
    }
    expect(body.body.tasks[0].title).toBe('Preparar');
    expect(body.body.tasks[0].notes).toBe('lista visible');
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
