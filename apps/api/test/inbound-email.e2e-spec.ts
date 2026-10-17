import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadRootEnv } from '../src/load-env';
import { ATTACHMENT_MAX_BYTES } from '../src/modules/tasks/attachment-storage';

loadRootEnv();
process.env.AUTH_MODE = 'dev';
process.env.SCHEDULER_AUTOSTART = 'false';
process.env.ATTACHMENT_DIR = `/tmp/reflexionia-attachments-${randomUUID()}`;

const prisma = new PrismaClient();

async function createOwner(name: string): Promise<{ id: string; email: string }> {
  const email = `${name}-${randomUUID()}@reflexionia.test`;
  const user = await prisma.user.create({
    data: { email, displayName: name, timeZone: 'Europe/Madrid' },
  });
  await prisma.project.create({
    data: { ownerId: user.id, name: 'Bandeja', isInbox: true },
  });
  return { id: user.id, email };
}

async function removeOwner(id: string): Promise<void> {
  await prisma.reminder.deleteMany({ where: { ownerId: id } });
  await prisma.attachment.deleteMany({ where: { ownerId: id } });
  await prisma.idempotencyRecord.deleteMany({ where: { ownerId: id } });
  await prisma.outboxEvent.deleteMany({ where: { ownerId: id } });
  await prisma.activityLog.deleteMany({ where: { ownerId: id } });
  await prisma.task.deleteMany({ where: { ownerId: id } });
  await prisma.project.deleteMany({ where: { ownerId: id } });
  await prisma.user.delete({ where: { id } });
}

interface CapturedTask {
  id: string;
  title: string;
  priority: string;
  content: string | null;
  source: string;
  project_id: string;
}

function taskOf(body: unknown): CapturedTask {
  if (typeof body !== 'object' || body === null) {
    throw new Error('missing task');
  }
  const record = body as Partial<CapturedTask>;
  if (
    typeof record.id !== 'string' ||
    typeof record.title !== 'string' ||
    typeof record.priority !== 'string' ||
    typeof record.source !== 'string' ||
    typeof record.project_id !== 'string' ||
    !(record.content === null || typeof record.content === 'string')
  ) {
    throw new Error('missing task');
  }
  return {
    id: record.id,
    title: record.title,
    priority: record.priority,
    content: record.content,
    source: record.source,
    project_id: record.project_id,
  };
}

function errorCode(body: unknown): string {
  if (typeof body !== 'object' || body === null) {
    throw new Error('missing error');
  }
  const code = (body as { error?: { code?: unknown } }).error?.code;
  if (typeof code !== 'string') {
    throw new Error('missing error');
  }
  return code;
}

function addressOf(body: unknown): { address: string; token: string } {
  if (typeof body !== 'object' || body === null) {
    throw new Error('missing address');
  }
  const record = body as { address?: unknown; token?: unknown };
  if (typeof record.address !== 'string' || typeof record.token !== 'string') {
    throw new Error('missing address');
  }
  return { address: record.address, token: record.token };
}

describe('email-to-task', () => {
  let app: INestApplication;
  let server: App;
  let owner: { id: string; email: string };

  beforeAll(async () => {
    await prisma.$connect();
    owner = await createOwner('inbound');
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

  function authed() {
    const header = { 'X-Dev-User-Email': owner.email };
    return {
      get: (url: string) => request(server).get(url).set(header),
      post: (url: string) => request(server).post(url).set(header),
      del: (url: string) => request(server).delete(url).set(header),
    };
  }

  it('RF-105: a regenerable address creates a task from the subject and stores attachments', async () => {
    const issued = addressOf((await authed().post('/api/v1/me/inbound-email').expect(201)).body);
    expect(issued.address).toBe(`${issued.token}@in.todo.reflexionia.com`);
    const status = await authed().get('/api/v1/me/inbound-email').expect(200);
    expect(status.body).toEqual({ active: true });
    expect(JSON.stringify(status.body)).not.toContain(issued.token);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    const hash = createHash('sha256').update(issued.token).digest('hex');
    expect(stored.inboundEmailTokenHash).toBe(hash);
    expect(stored.inboundEmailTokenHash).not.toContain(issued.token);

    const messageId = `<${randomUUID()}@in.todo.reflexionia.com>`;
    const created = taskOf(
      (
        await request(server)
          .post('/api/v1/inbound/email')
          .field('recipient', issued.address)
          .field('subject', 'comprar leche !alta')
          .field('text', '<script>alert(1)</script>\nNo ejecutar')
          .field('message_id', messageId)
          .attach('file', Buffer.from('nota'), { filename: 'nota.txt', contentType: 'text/plain' })
          .expect(201)
      ).body,
    );
    expect(created.title).toBe('comprar leche');
    expect(created.priority).toBe('high');
    expect(created.content).toContain('No ejecutar');
    expect(created.source).toBe('api');
    expect(created.project_id).toBeTruthy();

    const files = await authed().get(`/api/v1/tasks/${created.id}/attachments`).expect(200);
    expect(files.body.items).toHaveLength(1);
    const attachmentId = (files.body.items as { id?: unknown }[])[0]?.id;
    if (typeof attachmentId !== 'string') {
      throw new Error('missing attachment');
    }
    const download = await authed()
      .get(`/api/v1/tasks/${created.id}/attachments/${attachmentId}`)
      .expect(200);
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.text).toBe('nota');

    const again = taskOf(
      (
        await request(server)
          .post('/api/v1/inbound/email')
          .field('recipient', issued.address)
          .field('subject', 'otro asunto')
          .field('message_id', messageId)
          .expect(201)
      ).body,
    );
    expect(again.id).toBe(created.id);
    expect(await prisma.task.count({ where: { ownerId: owner.id, title: 'otro asunto' } })).toBe(0);

    const rotated = addressOf((await authed().post('/api/v1/me/inbound-email').expect(201)).body);
    expect(rotated.token).not.toBe(issued.token);
    await request(server)
      .post('/api/v1/inbound/email')
      .field('recipient', issued.address)
      .field('subject', 'viejo token')
      .expect(401);
    const fresh = taskOf(
      (
        await request(server)
          .post('/api/v1/inbound/email')
          .field('recipient', rotated.address)
          .field('subject', 'token nuevo')
          .expect(201)
      ).body,
    );
    expect(fresh.title).toBe('token nuevo');

    const beforeEmpty = await prisma.task.count({ where: { ownerId: owner.id } });
    const empty = await request(server)
      .post('/api/v1/inbound/email')
      .field('recipient', rotated.address)
      .field('subject', '   ')
      .expect(400);
    expect(errorCode(empty.body)).toBe('empty_title');
    expect(await prisma.task.count({ where: { ownerId: owner.id } })).toBe(beforeEmpty);

    await authed().del('/api/v1/me/inbound-email').expect(204);
    expect((await authed().get('/api/v1/me/inbound-email')).body).toEqual({ active: false });
    await request(server)
      .post('/api/v1/inbound/email')
      .field('recipient', rotated.address)
      .field('subject', 'revocado')
      .expect(401);

    const before = await prisma.task.count({ where: { ownerId: owner.id } });
    await request(server)
      .post('/api/v1/inbound/email')
      .field('recipient', 'no-es-nuestro@example.com')
      .field('subject', 'fuera')
      .expect(401);
    expect(await prisma.task.count({ where: { ownerId: owner.id } })).toBe(before);
  });

  it('RF-105: an attachment over 25 MB is refused', async () => {
    const issued = addressOf((await authed().post('/api/v1/me/inbound-email').expect(201)).body);
    const before = await prisma.task.count({ where: { ownerId: owner.id } });
    await request(server)
      .post('/api/v1/inbound/email')
      .field('recipient', issued.address)
      .field('subject', 'demasiado grande')
      .attach('file', Buffer.alloc(ATTACHMENT_MAX_BYTES + 1), {
        filename: 'grande.bin',
        contentType: 'application/octet-stream',
      })
      .expect(413);
    expect(await prisma.task.count({ where: { ownerId: owner.id } })).toBe(before);
  });
});
