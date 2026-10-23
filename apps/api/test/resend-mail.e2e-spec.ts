import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { SchedulerService } from '../src/scheduler/scheduler.service.js';

const prisma = new PrismaClient();
let app: INestApplication;
let server: Parameters<typeof request>[0];
let ownerId = '';
let projectId = '';
let email = '';
let rejectMail = true;
const mail: { key: string; body: string }[] = [];
const push = vi.hoisted(() => ({ send: vi.fn(() => Promise.resolve({})) }));
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: push.send } }));

describe('RF-802 RF-808: Resend reminder delivery', () => {
  beforeAll(async () => {
    vi.stubEnv('AUTH_MODE', 'dev');
    vi.stubEnv('RESEND_API_KEY', randomBytes(24).toString('hex'));
    vi.stubEnv('EMAIL_FROM', 'App <notices@example.test>');
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('SMTP_FROM', '');
    vi.stubEnv('VAPID_PUBLIC_KEY', randomBytes(32).toString('base64url'));
    vi.stubEnv('VAPID_PRIVATE_KEY', randomBytes(32).toString('base64url'));
    vi.stubEnv('VAPID_SUBJECT', 'mailto:test@example.test');
    vi.stubGlobal('fetch', (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? init.body : '';
      if (url === 'https://api.resend.com/emails') {
        mail.push({ key: new Headers(init?.headers).get('Idempotency-Key') ?? '', body });
        return Promise.resolve(
          rejectMail
            ? Response.json(
                { message: 'rate limited' },
                { status: 429, headers: { 'retry-after': '2' } },
              )
            : Response.json({ id: 'accepted-mail' }),
        );
      }
      throw new Error('Unexpected network call in Resend integration test');
    });
    email = `resend-${randomUUID()}@example.test`;
    const owner = await prisma.user.create({ data: { email, displayName: 'Resend' } });
    ownerId = owner.id;
    await prisma.notificationPreference.create({
      data: { userId: ownerId, kind: 'task', channel: 'email', enabled: true },
    });
    const project = await prisma.project.create({
      data: { ownerId, name: 'Inbox', isInbox: true },
    });
    projectId = project.id;
    await prisma.pushSubscription.create({
      data: {
        ownerId,
        endpoint: `https://push.example.test/${randomUUID()}`,
        p256dh: 'unit-key',
        auth: 'unit-auth',
      },
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });
  afterAll(async () => {
    await app.close();
    await prisma.reminderDelivery.deleteMany({ where: { ownerId } });
    await prisma.reminder.deleteMany({ where: { ownerId } });
    await prisma.idempotencyRecord.deleteMany({ where: { ownerId } });
    await prisma.outboxEvent.deleteMany({ where: { ownerId } });
    await prisma.activityLog.deleteMany({ where: { ownerId } });
    await prisma.task.deleteMany({ where: { ownerId } });
    await prisma.project.deleteMany({ where: { ownerId } });
    await prisma.pushSubscription.deleteMany({ where: { ownerId } });
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it('retries a rejected email with the same key and does not repeat the successful push delivery', async () => {
    const settings = await request(server)
      .get('/api/v1/me/notifications/settings')
      .set('X-Dev-User-Email', email)
      .expect(200);
    expect(settings.body.channels.email.configured).toBe(true);
    const now = new Date();
    const created = await request(server)
      .post('/api/v1/tasks')
      .set('X-Dev-User-Email', email)
      .send({
        project_id: projectId,
        title: 'Resend retry task',
        due_date: new Date(now.getTime() - 3_600_000).toISOString(),
      })
      .expect(201);
    const reminder = await request(server)
      .post(`/api/v1/tasks/${String(created.body.id)}/reminders`)
      .set('X-Dev-User-Email', email)
      .send({ trigger: 'TRIGGER:PT0S', type: 'relative', channel: 'both' })
      .expect(201);
    const scheduler = app.get(SchedulerService);
    await scheduler.run(now, true);
    const delivery = await prisma.reminderDelivery.findFirstOrThrow({
      where: { reminderId: String(reminder.body.id) },
    });
    expect(delivery.status).toBe('failed');
    expect(delivery.channelState).toMatchObject({ email: 'rate_limited', push: 'sent' });
    const pushCount = push.send.mock.calls.length;
    rejectMail = false;
    await scheduler.run(new Date(now.getTime() + 3_000), true);
    const sent = await prisma.reminderDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(sent.status).toBe('late');
    expect(sent.channelState).toMatchObject({ email: 'sent', push: 'sent' });
    const attempts = mail.filter((item) => item.key === `reminder/${delivery.id}`);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]?.body).toBe(attempts[0]?.body);
    expect(push.send).toHaveBeenCalledTimes(pushCount);
  });
});
