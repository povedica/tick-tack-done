import { randomUUID } from 'node:crypto';
import { readdir, rm } from 'node:fs/promises';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { sealField } from '../src/security/field-cipher.js';
import { loadRootEnv } from '../src/load-env.js';
import { fakeDrive } from './helpers/fake-drive.js';
loadRootEnv();
process.env.AUTH_MODE = 'dev';
process.env.GOOGLE_CLIENT_ID = 'synthetic-client';
process.env.GOOGLE_CLIENT_SECRET = 'synthetic-secret';




const prohibited = `/tmp/r80-drive-prohibited-${randomUUID()}`;
process.env.ATTACHMENT_DIR = prohibited;
const prisma = new PrismaClient();
let app: INestApplication;
let server: Parameters<typeof request>[0];
let google: Awaited<ReturnType<typeof fakeDrive>>;
let owner: { id: string; email: string };
let taskId: string;
let projectId: string;
const authed = () => ({ 'X-Dev-User-Email': owner.email });
describe('TTD-AUD-99 Drive-only attachments', () => {
  beforeAll(async () => {
    google = await fakeDrive();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    owner = await prisma.user.create({
      data: {
        email: `r80-drive-${randomUUID()}@example.test`,
        displayName: 'R80 Drive',
        timeZone: 'Europe/Madrid',
      },
    });
    const project = await prisma.project.create({
      data: { ownerId: owner.id, name: 'Casa', isInbox: true },
    });
    projectId = project.id;
    const task = await prisma.task.create({
      data: { ownerId: owner.id, projectId, createdById: owner.id, title: 'Synthetic attachments' },
    });
    taskId = task.id;
  });
  afterAll(async () => {
    await app.close();
    await google.close();
    await prisma.idempotencyRecord.deleteMany({ where: { ownerId: owner.id } });
    await prisma.activityLog.deleteMany({ where: { ownerId: owner.id } });
    await prisma.outboxEvent.deleteMany({ where: { ownerId: owner.id } });
    await prisma.attachment.deleteMany({ where: { ownerId: owner.id } });
    await prisma.driveFolder.deleteMany({ where: { userId: owner.id } });
    await prisma.task.deleteMany({ where: { ownerId: owner.id } });
    await prisma.project.deleteMany({ where: { ownerId: owner.id } });
    await prisma.user.delete({ where: { id: owner.id } });
    await prisma.$disconnect();
    await rm(prohibited, { recursive: true, force: true });
  });
  it('rejects uploads without Drive before consuming a file', async () => {
    const result = await request(server)
      .post(`/api/v1/tasks/${taskId}/attachments`)
      .set(authed())
      .attach('file', Buffer.from('synthetic'), 'x.txt')
      .expect(409);
    expect(result.body.error.code).toBe('drive_not_connected');
    expect(await readdir(prohibited).catch(() => [])).toEqual([]);
  });
  it('initiates browser-to-Drive upload and verifies the signed completion metadata', async () => {
    await prisma.user.update({
      where: { id: owner.id },
      data: { googleRefreshToken: sealField('synthetic-refresh'), googleStatus: 'connected',googleGrantedScopes:['https://www.googleapis.com/auth/drive.file'],googleDriveEnabled:true,googleCalendarEnabled:true },
    });
    const session = await request(server)
      .post(`/api/v1/tasks/${taskId}/attachments/drive-session`)
      .set(authed())
      .send({ name: 'browser.txt', mime_type: 'text/plain', size: 4 })
      .expect(201);
    expect(Object.keys(session.body as object).sort()).toEqual(['upload_id', 'upload_url']);
    expect(JSON.stringify(session.body)).not.toContain('synthetic-access');
    const uploaded = await fetch(session.body.upload_url as string, {
      method: 'PUT',
      body: 'data',
    });
    const file = (await uploaded.json()) as { id: string };
    await request(server)
      .post(`/api/v1/tasks/${taskId}/attachments/drive-complete`)
      .set(authed())
      .send({ upload_id: String(session.body.upload_id) + 'tampered', drive_file_id: file.id })
      .expect(400);
    const completed = await request(server)
      .post(`/api/v1/tasks/${taskId}/attachments/drive-complete`)
      .set(authed())
      .send({ upload_id: session.body.upload_id, drive_file_id: file.id })
      .expect(201);
    expect(completed.body).toMatchObject({
      drive_file_id: file.id,
      source: 'web',
      byte_size: 4,
      drive_state: 'ok',
    });
    const folders = await prisma.driveFolder.findMany({ where: { userId: owner.id } });
    expect(folders).toHaveLength(2);
    expect(google.files.get(file.id)?.parents).toContain(
      folders.find((folder) => folder.projectId === projectId)?.driveFolderId,
    );
    expect(
      google.requests
        .filter((row) => row.method === 'POST' && row.path.includes('/upload/'))
        .every((row) => row.bytes < 4096),
    ).toBe(true);
  });
  it('streams multipart to Drive, redirects preview without caching and preserves files unless trash was chosen', async () => {
    const uploaded = await request(server)
      .post(`/api/v1/tasks/${taskId}/attachments`)
      .set(authed())
      .attach('file', Buffer.from('API streaming data'), 'api.txt')
      .expect(201);
    expect(uploaded.body.source).toBe('api');
    const id = String(uploaded.body.id);
    const fileId = String(uploaded.body.drive_file_id);
    await request(server)
      .get(`/api/v1/attachments/${id}/preview`)
      .set(authed())
      .expect(302)
      .expect('Cache-Control', 'no-store');
    const open = await request(server)
      .get(`/api/v1/tasks/${taskId}/attachments/${id}`)
      .set(authed())
      .expect(302);
    expect(open.headers.location).toContain('drive.google.com');
    await request(server)
      .delete(`/api/v1/tasks/${taskId}/attachments/${id}`)
      .set(authed())
      .expect(204);
    expect(google.files.get(fileId)?.trashed).not.toBe(true);
    const linked = await request(server)
      .post(`/api/v1/tasks/${taskId}/attachments/drive-link`)
      .set(authed())
      .send({ drive_file_id: fileId })
      .expect(201);
    google.setFailTrash(true);
    await request(server)
      .delete(`/api/v1/tasks/${taskId}/attachments/${String(linked.body.id)}?trash_in_drive=true`)
      .set(authed())
      .expect(502);
    expect(
      (await prisma.attachment.findUniqueOrThrow({ where: { id: String(linked.body.id) } }))
        .deletedAt,
    ).toBeNull();
    google.setFailTrash(false);
    await request(server)
      .delete(`/api/v1/tasks/${taskId}/attachments/${String(linked.body.id)}?trash_in_drive=true`)
      .set(authed())
      .expect(204);
    expect(google.files.get(fileId)?.trashed).toBe(true);
    expect(await readdir(prohibited).catch(() => [])).toEqual([]);
  });
  it('streams email and Telegram captures to Drive without retaining local files', async () => {
    await prisma.user.update({
      where: { id: owner.id },
      data: { googleRefreshToken: sealField('synthetic-refresh'), googleStatus: 'connected',googleGrantedScopes:['https://www.googleapis.com/auth/drive.file'],googleDriveEnabled:true,googleCalendarEnabled:true },
    });
    const issued = await request(server).post('/api/v1/me/inbound-email').set(authed()).expect(201);
    const messageId = randomUUID();
    const email = await request(server)
      .post('/api/v1/inbound/email')
      .field('recipient', String(issued.body.address))
      .field('subject', 'R80 streamed email')
      .field('text', 'Synthetic email')
      .field('message_id', messageId)
      .attach('file', Buffer.from('Email stream'), 'mail.txt')
      .expect(201);
    expect(
      await prisma.attachment.count({ where: { taskId: String(email.body.id), source: 'email' } }),
    ).toBe(1);
    await request(server)
      .post('/api/v1/inbound/email')
      .field('recipient', String(issued.body.address))
      .field('subject', 'R80 streamed email')
      .field('message_id', messageId)
      .attach('file', Buffer.from('Email stream'), 'mail.txt')
      .expect(201);
    expect(
      await prisma.attachment.count({ where: { taskId: String(email.body.id), source: 'email' } }),
    ).toBe(1);
    process.env.TELEGRAM_BOT_TOKEN = 'synthetic-bot';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'synthetic_webhook_secret_99';
    const driveFetch = globalThis.fetch;
    vi.stubGlobal('fetch', ((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
      const parsed=new URL(url);
      if (parsed.origin==='https://api.telegram.org' && parsed.pathname.startsWith('/file/'))
        return Promise.resolve(new Response(Buffer.from([255, 216, 255, 1, 2])));
      if (parsed.origin==='https://api.telegram.org' && parsed.pathname.endsWith('/getFile'))
        return Promise.resolve(
          Response.json({ ok: true, result: { file_path: 'photos/synthetic.jpg' } }),
        );
      if (parsed.origin==='https://api.telegram.org')
        return Promise.resolve(Response.json({ ok: true, result: {} }));
      return driveFetch(input, init);
    }));
    const chatId = `r80-${randomUUID()}`;
    await prisma.telegramLink.create({ data: { ownerId: owner.id, chatId } });
    try {
      await request(server)
        .post('/api/v1/integrations/telegram/webhook')
        .set('x-telegram-bot-api-secret-token', process.env.TELEGRAM_WEBHOOK_SECRET)
        .send({
          update_id: Math.floor(Math.random() * 1000000000),
          message: {
            chat: { id: chatId },
            caption: 'R80 streamed Telegram',
            photo: [{ file_id: 'synthetic-photo' }],
          },
        })
        .expect(200);
      expect(
        await prisma.attachment.count({ where: { ownerId: owner.id, source: 'telegram' } }),
      ).toBe(1);
      expect(await readdir(prohibited).catch(() => [])).toEqual([]);
    } finally {
      vi.stubGlobal('fetch', driveFetch);
      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
      await prisma.telegramLink.deleteMany({ where: { ownerId: owner.id } });
    }
  });
  it('marks a revoked token as reauth_required and reports quota as 507', async () => {
    google.setQuota(true);
    await request(server)
      .post(`/api/v1/tasks/${taskId}/attachments/drive-session`)
      .set(authed())
      .send({ name: 'quota.txt', mime_type: 'text/plain', size: 4 })
      .expect(507);
    google.setQuota(false);
    google.setRevoked(true);
    const result = await request(server)
      .post(`/api/v1/tasks/${taskId}/attachments/drive-session`)
      .set(authed())
      .send({ name: 'revoked.txt', mime_type: 'text/plain', size: 4 })
      .expect(409);
    expect(result.body.error.code).toBe('drive_reauth_required');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).googleStatus).toBe(
      'reauth_required',
    );
  });
});
