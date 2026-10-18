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

loadRootEnv();
process.env.AUTH_MODE = 'dev';
process.env.SCHEDULER_AUTOSTART = 'false';
process.env.BUS_AUTOSTART = 'false';
process.env.REGISTRATION_OPEN = 'true';
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;
delete process.env.GOOGLE_REFRESH_TOKEN;

const prisma = new PrismaClient();

describe('V1 and V2 product', () => {
  let app: INestApplication | undefined;
  let server: App;
  let email: string;
  let cookie: string;
  let csrf: string;
  let userId: string;
  let projectId: string;

  beforeAll(async () => {
    await prisma.$connect();
    email = `v1-${randomUUID()}@reflexionia.test`;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as App;
    const registered = await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password: 'correct-horse', display_name: 'V1' })
      .expect(201);
    userId = registered.body.id as string;
    cookie = cookieHeader(registered.headers['set-cookie']);
    csrf = registered.body.csrf_token as string;
    const projects = await session().get('/api/v1/projects').expect(200);
    const inbox = (projects.body.items as { id: string; is_inbox?: boolean }[]).find(
      (item) => item.is_inbox === true,
    );
    if (inbox === undefined) {
      throw new Error('inbox missing');
    }
    projectId = inbox.id;
  });

  afterAll(async () => {
    if (app !== undefined) {
      await app.close();
    }
    await wipe(userId);
    await prisma.$disconnect();
  });

  it('RF-1002: a column refuses a card past its WIP limit', async () => {
    const column = await session()
      .post(`/api/v1/projects/${projectId}/columns`)
      .send({ name: 'Haciendo', wip_limit: 1 })
      .expect(201);
    const first = await session()
      .post('/api/v1/tasks')
      .send({ project_id: projectId, title: 'una', column_id: column.body.id })
      .expect(201);
    expect(first.body.column_id).toBe(column.body.id);
    const second = await session()
      .post('/api/v1/tasks')
      .send({ project_id: projectId, title: 'dos' })
      .expect(201);
    const denied = await session()
      .patch(`/api/v1/tasks/${second.body.id as string}`)
      .send({ column_id: column.body.id })
      .expect(409);
    expect(denied.body.error.code).toBe('wip_exceeded');
  });

  it('RF-1004: saving a quadrant rule emits matrix.updated', async () => {
    await session()
      .put('/api/v1/matrix/rules')
      .send({ quadrant: 'do', rules: null, effect: { priority: 'high', due: 'within_24h' } })
      .expect(200);
    const rules = await session().get('/api/v1/matrix/rules').expect(200);
    expect(rules.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ quadrant: 'do', custom: true })]),
    );
  });

  it('RF-1401: notes are tasks with kind note and a sticky can be pinned', async () => {
    await session()
      .post('/api/v1/tasks')
      .send({ project_id: projectId, title: 'apunte', kind: 'note' })
      .expect(201);
    const notes = await session().get('/api/v1/notes').expect(200);
    expect(notes.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'apunte' })]),
    );
    await session().post('/api/v1/sticky-notes').send({ text: 'encima' }).expect(201);
  });

  it('RF-1702: CSV import creates tasks and RF-1703 exports CSV and iCal', async () => {
    const imported = await session()
      .post('/api/v1/import/csv')
      .send({ csv: 'titulo\ndesde csv', title_column: 'titulo', project_id: projectId })
      .expect(201);
    expect(imported.body.created).toBe(1);
    const csv = await session().get(`/api/v1/export/csv?project_id=${projectId}`).expect(200);
    expect(csv.text).toContain('desde csv');
    const ical = await session().get(`/api/v1/export/ical?project_id=${projectId}`).expect(200);
    expect(ical.headers['content-type']).toContain('text/calendar');
  });

  it('RF-1104: a secret feed is readable outside /api/v1 and dies when revoked', async () => {
    const feed = await session()
      .post('/api/v1/calendar/feeds')
      .send({ project_id: projectId })
      .expect(201);
    const url = new URL(feed.body.url as string);
    const body = await request(server).get(url.pathname).expect(200);
    expect(body.text).toContain('BEGIN:VCALENDAR');
    await session()
      .delete(`/api/v1/calendar/feeds/${feed.body.id as string}`)
      .expect(204);
    await request(server).get(url.pathname).expect(404);
  });

  it('RF-2102: the dashboard returns backend KPIs', async () => {
    const data = await session().get('/api/v1/dashboard/data').expect(200);
    expect(data.body.widgets).toEqual(
      expect.objectContaining({ completed_today: expect.any(Number) }),
    );
  });

  it('RF-2201: the weekly report is deterministic and stored', async () => {
    const built = await session().post('/api/v1/reports/weekly').expect(200);
    expect(typeof built.body.summary).toBe('string');
    const history = await session().get('/api/v1/reports/weekly').expect(200);
    expect(history.body.items.length).toBeGreaterThan(0);
  });

  it('RF-2301: the daily review proposes and does not complete tasks', async () => {
    const before = await prisma.task.count({ where: { ownerId: userId, status: 'completed' } });
    const review = await session().get('/api/v1/review/daily').expect(200);
    expect(Array.isArray(review.body.task_ids)).toBe(true);
    const after = await prisma.task.count({ where: { ownerId: userId, status: 'completed' } });
    expect(after).toBe(before);
  });

  it('RF-1201: a focus session is stored on the server', async () => {
    const started = await session().post('/api/v1/focus/sessions').send({}).expect(201);
    expect(started.body.remaining_seconds).toBeGreaterThan(0);
    await session()
      .post(`/api/v1/focus/sessions/${started.body.id as string}/finish`)
      .expect(200);
  });

  it('RF-1602: turning achievements off yields a null score', async () => {
    const off = await session()
      .patch('/api/v1/me/achievements')
      .send({ enabled: false })
      .expect(200);
    expect(off.body.score).toBeNull();
  });

  it('RF-2003: the Telegram webhook stops when the bot token is missing', async () => {
    const status = await session().get('/api/v1/integrations/telegram').expect(200);
    expect(status.body.configured).toBe(false);
    const denied = await session()
      .post('/api/v1/integrations/telegram/webhook')
      .send({ text: '/today' })
      .expect(503);
    expect(denied.body.error.code).toBe('telegram_not_configured');
  });

  it('RF-2003: the webhook creates the task, completes by title and stores a photo', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_VOICE_PROVIDER = 'https://voice.test/transcribe';
    const paths: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const url =
        input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url;
      const path = new URL(url).pathname;
      paths.push(path);
      if (url.startsWith('https://voice.test/')) {
        return new Response(JSON.stringify({ text: 'llamar a Ana manana' }), { status: 200 });
      }
      if (url.includes('/file/bot')) {
        return new Response(Buffer.from('jpeg-bytes'), { status: 200 });
      }
      if (url.startsWith('https://api.telegram.org/')) {
        return new Response(JSON.stringify({ ok: true, result: { file_path: 'photos/a.jpg' } }), {
          status: 200,
        });
      }
      return original(input, init);
    };
    const secret = createHash('sha256').update('test-token').digest('hex');
    const stamp = randomUUID().slice(0, 8);
    const title = `planta-${stamp}`;
    try {
      await session()
        .post('/api/v1/integrations/telegram/link')
        .send({ chat_id: '4242' })
        .expect(201);
      const created = await request(server)
        .post('/api/v1/integrations/telegram/webhook')
        .set('x-telegram-bot-api-secret-token', secret)
        .send({
          update_id: 11,
          message: { chat: { id: 4242 }, text: `/capturar ${title} manana` },
        })
        .expect(200);
      expect(created.body).toEqual({ called_telegram: true, action: 'text' });
      const listed = await session().get(`/api/v1/tasks?q=${title}`).expect(200);
      const task = (listed.body.items as { id: string; title: string }[]).find((item) =>
        item.title.includes(stamp),
      );
      expect(task).toBeDefined();
      const done = await request(server)
        .post('/api/v1/integrations/telegram/webhook')
        .set('x-telegram-bot-api-secret-token', secret)
        .send({
          update_id: 12,
          message: { chat: { id: 4242 }, text: `completar ${title}` },
        })
        .expect(200);
      expect(done.body.action).toBe('text');
      const after = await session()
        .get(`/api/v1/tasks/${task?.id ?? ''}`)
        .expect(200);
      expect(after.body.status).toBe('completed');

      const voice = await request(server)
        .post('/api/v1/integrations/telegram/webhook')
        .set('x-telegram-bot-api-secret-token', secret)
        .send({
          update_id: 13,
          message: { chat: { id: 4242 }, voice: { file_id: 'voice-1' } },
        })
        .expect(200);
      expect(voice.body).toEqual({ called_telegram: true, action: 'voice' });

      const photo = await request(server)
        .post('/api/v1/integrations/telegram/webhook')
        .set('x-telegram-bot-api-secret-token', secret)
        .send({
          update_id: 14,
          message: {
            chat: { id: 4242 },
            caption: `foto-${stamp}`,
            photo: [{ file_id: 'small' }, { file_id: 'large' }],
          },
        })
        .expect(200);
      expect(photo.body.action).toBe('photo');
      const photos = await session().get(`/api/v1/tasks?q=foto-${stamp}`).expect(200);
      const photoTask = (photos.body.items as { id: string }[])[0];
      expect(photoTask).toBeDefined();
      const files = await session()
        .get(`/api/v1/tasks/${photoTask?.id ?? ''}/attachments`)
        .expect(200);
      expect(files.body.items.length).toBeGreaterThan(0);
      expect(paths.some((item) => item.endsWith('/sendMessage'))).toBe(true);

      const denied = await request(server)
        .post('/api/v1/integrations/telegram/webhook')
        .set('x-telegram-bot-api-secret-token', 'nope')
        .send({ update_id: 15, message: { chat: { id: 4242 }, text: 'hola' } })
        .expect(401);
      expect(denied.body.error.code).toBe('unauthorized');
    } finally {
      globalThis.fetch = original;
      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_VOICE_PROVIDER;
    }
  });

  it('RF-2004: calendar read and write use the stored refresh token', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'env-should-not-be-used';
    await prisma.user.update({
      where: { id: userId },
      data: { googleRefreshToken: 'stored-refresh-token' },
    });
    const methods: string[] = [];
    const refreshUsed: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url =
        input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url;
      const method = init?.method ?? 'GET';
      const body =
        typeof init?.body === 'string'
          ? init.body
          : init?.body instanceof URLSearchParams
            ? init.body.toString()
            : '';
      if (url.includes('oauth2.googleapis.com/token')) {
        refreshUsed.push(body);
        return new Response(JSON.stringify({ access_token: 'access' }), { status: 200 });
      }
      if (url.includes('/calendar/v3/') && method === 'GET') {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'g1',
                summary: 'Cita',
                start: { dateTime: '2026-10-20T09:00:00Z' },
                end: { dateTime: '2026-10-20T10:00:00Z' },
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes('/calendar/v3/') && (method === 'POST' || method === 'PATCH')) {
        methods.push(method);
        return new Response(JSON.stringify({ id: 'evt-1' }), { status: 200 });
      }
      if (url.includes('www.googleapis.com/drive')) {
        if (url.includes('alt=media')) {
          return new Response(Buffer.from('pdf-bytes'), { status: 200 });
        }
        return new Response(JSON.stringify({ name: 'notas.pdf', mimeType: 'application/pdf' }), {
          status: 200,
        });
      }
      return original(input, init);
    };
    try {
      const read = await session()
        .post('/api/v1/calendar/subscriptions')
        .send({ provider: 'google', sync_direction: 'read' })
        .expect(201);
      const imported = await session()
        .post(`/api/v1/calendar/subscriptions/${read.body.id as string}/refresh`)
        .expect(200);
      expect(imported.body.imported).toBe(1);
      const write = await session()
        .post('/api/v1/calendar/subscriptions')
        .send({ provider: 'google', sync_direction: 'two_way' })
        .expect(201);
      await session()
        .post('/api/v1/tasks')
        .send({
          project_id: projectId,
          title: 'en el calendario',
          due_date: '2026-10-21T09:00:00.000Z',
        })
        .expect(201);
      const pushed = await session()
        .post(`/api/v1/calendar/subscriptions/${write.body.id as string}/push`)
        .expect(200);
      expect(pushed.body.pushed).toBeGreaterThan(0);
      await session()
        .post(`/api/v1/calendar/subscriptions/${write.body.id as string}/push`)
        .expect(200);
      expect(methods).toContain('POST');
      expect(methods).toContain('PATCH');
      expect(refreshUsed.some((item) => item.includes('stored-refresh-token'))).toBe(true);
      expect(refreshUsed.some((item) => item.includes('env-should-not-be-used'))).toBe(false);

      const task = await session()
        .post('/api/v1/tasks')
        .send({ project_id: projectId, title: 'con copia' })
        .expect(201);
      const attached = await session()
        .post('/api/v1/integrations/drive/attachments')
        .send({
          task_id: task.body.id,
          file_id: 'file-2',
          url: 'https://drive.google.com/file/d/file-2',
          name: 'notas.pdf',
          copy: true,
        })
        .expect(201);
      expect(attached.body.copied).toBe(true);
    } finally {
      globalThis.fetch = original;
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.GOOGLE_REFRESH_TOKEN;
      await prisma.user.update({ where: { id: userId }, data: { googleRefreshToken: null } });
    }
  });

  it('RF-2005: a Drive link is stored and nothing is copied', async () => {
    const task = await session()
      .post('/api/v1/tasks')
      .send({ project_id: projectId, title: 'con drive' })
      .expect(201);
    const attached = await session()
      .post('/api/v1/integrations/drive/attachments')
      .send({
        task_id: task.body.id,
        file_id: 'file-1',
        url: 'https://drive.google.com/file/d/file-1',
        name: 'notas.pdf',
      })
      .expect(201);
    expect(attached.body.copied).toBe(false);
  });

  it('RF-806: a location reminder stays quiet when the point is outside the fence', async () => {
    const task = await session()
      .post('/api/v1/tasks')
      .send({ project_id: projectId, title: 'en casa' })
      .expect(201);
    await session()
      .post(`/api/v1/tasks/${task.body.id as string}/reminders`)
      .send({
        trigger: 'TRIGGER;VALUE=DATE-TIME:19700101T000000Z',
        type: 'location',
        location: { lat: 40.4, lon: -3.7, radius_m: 100 },
      })
      .expect(201);
    const checked = await session()
      .post('/api/v1/me/location')
      .send({ lat: 0, lon: 0 })
      .expect(200);
    expect(checked.body.fired).toEqual([]);
  });

  it('RF-13013: the event stream is server-sent events', async () => {
    const stream = await session().get('/api/v1/events/stream?once=1').expect(200);
    expect(stream.headers['content-type']).toContain('text/event-stream');
  });

  it('section 10.4: /open/v1 lists projects with TickTick field names', async () => {
    const page = await session().get('/open/v1/project').expect(200);
    expect(page.body[0]).toEqual(expect.objectContaining({ name: expect.any(String) }));
  });

  it('RF-2004: Google consent stays stopped without a client id', async () => {
    const denied = await session()
      .get('/api/v1/integrations/google/start')
      .set('Origin', 'http://127.0.0.1:5173')
      .expect(503);
    expect(denied.body.error.code).toBe('google_not_configured');
  });

  it('does not call Google when the refresh token is missing', async () => {
    const denied = await session()
      .post('/api/v1/calendar/subscriptions')
      .send({ provider: 'google', sync_direction: 'read' })
      .expect(503);
    expect(denied.body.error.code).toBe('google_not_configured');
  });

  function session() {
    return {
      get: (url: string) =>
        request(server).get(url).set('Cookie', cookie).set('X-CSRF-Token', csrf),
      post: (url: string) =>
        request(server).post(url).set('Cookie', cookie).set('X-CSRF-Token', csrf),
      patch: (url: string) =>
        request(server).patch(url).set('Cookie', cookie).set('X-CSRF-Token', csrf),
      put: (url: string) =>
        request(server).put(url).set('Cookie', cookie).set('X-CSRF-Token', csrf),
      delete: (url: string) =>
        request(server).delete(url).set('Cookie', cookie).set('X-CSRF-Token', csrf),
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
  await prisma.focusSession.deleteMany({ where: { ownerId: id } });
  await prisma.stickyNote.deleteMany({ where: { ownerId: id } });
  await prisma.weeklyReport.deleteMany({ where: { ownerId: id } });
  await prisma.externalEvent.deleteMany({ where: { ownerId: id } });
  await prisma.calendarSubscription.deleteMany({ where: { ownerId: id } });
  await prisma.attachment.deleteMany({ where: { ownerId: id } });
  await prisma.comment.deleteMany({ where: { ownerId: id } });
  await prisma.reminderDelivery.deleteMany({ where: { ownerId: id } });
  await prisma.reminder.deleteMany({ where: { ownerId: id } });
  await prisma.checklistItem.deleteMany({ where: { ownerId: id } });
  await prisma.taskTag.deleteMany({ where: { task: { ownerId: id } } });
  await prisma.task.deleteMany({ where: { ownerId: id } });
  await prisma.project.deleteMany({ where: { ownerId: id } });
  await prisma.tag.deleteMany({ where: { ownerId: id } });
  await prisma.session.deleteMany({ where: { userId: id } });
  await prisma.user.deleteMany({ where: { id } });
}
