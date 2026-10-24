import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { sealField } from '../src/security/field-cipher.js';
import { ReminderTransport, type ReminderMessage } from '../src/scheduler/reminder.transport.js';
import { deliverNotification } from '../src/notifications/deliver.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
process.env.AUTH_MODE = 'dev';
const prisma = new PrismaClient();
let app: INestApplication;
let ownerId: string;
let email: string;
let projectId: string;
let taskId: string;
const deliver = vi.fn((message: ReminderMessage) =>
  Promise.resolve({
    push: message.allowPush === false ? ('skipped' as const) : ('sent' as const),
    email: message.allowEmail === false ? ('skipped' as const) : ('sent' as const),
    telegram: message.allowTelegram === false ? ('skipped' as const) : ('sent' as const),
    telegram_message_id: null,
    retry_after_seconds: null,
  }),
);
beforeAll(async () => {
  vi.stubEnv('PUBLIC_URL', 'https://todo.example.org');
  const botId = `notifications-${randomUUID()}`;
  const owner = await prisma.user.create({
    data: {
      email: `notifications-${randomUUID()}@example.test`,
      displayName: 'Synthetic notifications',
      timeZone: 'Europe/Madrid',
    },
  });
  ownerId = owner.id;
  email = owner.email;
  await prisma.telegramBotConfiguration.create({
    data: {
      ownerId,
      botId,
      webhookUrl: `https://todo.example.org/api/v1/integrations/telegram/webhook/${ownerId}`,
      username: 'synthetic_bot',
      token: sealField('synthetic-token'),
      webhookSecret: sealField('synthetic-secret'),
    },
  });
  const project = await prisma.project.create({
    data: { ownerId, name: 'Synthetic notifications' },
  });
  projectId = project.id;
  const task = await prisma.task.create({
    data: { ownerId, projectId, createdById: ownerId, title: 'Synthetic reminder' },
  });
  taskId = task.id;
  await prisma.telegramLink.create({
    data: { ownerId, botId, chatId: `synthetic-${randomUUID()}` },
  });
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ReminderTransport)
    .useValue({ deliver })
    .compile();
  app = module.createNestApplication();
  configureApp(app);
  await app.init();
});
afterAll(async () => {
  await app.close();
  if (ownerId) {
    await prisma.outboxEvent.deleteMany({ where: { ownerId } });
    await prisma.activityLog.deleteMany({ where: { ownerId } });
    await prisma.reminderDelivery.deleteMany({ where: { ownerId } });
    await prisma.task.deleteMany({ where: { ownerId } });
    await prisma.project.deleteMany({ where: { ownerId } });
    await prisma.telegramBotConfiguration.deleteMany({ where: { ownerId } });
    await prisma.user.delete({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
  vi.unstubAllEnvs();
});
function api() {
  return request(app.getHttpServer() as Parameters<typeof request>[0]);
}
async function job(now: Date) {
  return prisma.reminderDelivery.create({
    data: { ownerId, taskId, dedupeKey: randomUUID(), fireAt: now, kind: 'task', channel: 'push' },
  });
}
it('TTD-AUD-102: disabling Telegram leaves push enabled and records the exact skipped reason', async () => {
  await api()
    .put('/api/v1/me/notifications/settings')
    .set('X-Dev-User-Email', email)
    .send({ preferences: [{ kind: 'task', channel: 'telegram', enabled: false }] })
    .expect(200);
  const row = await job(new Date());
  await deliverNotification(
    prisma as PrismaService,
    { deliver } as unknown as ReminderTransport,
    row,
    new Date(),
    { title: 'Synthetic', body: 'Reminder' },
  );
  expect(deliver).toHaveBeenLastCalledWith(
    expect.objectContaining({ allowPush: true, allowTelegram: false }),
  );
  expect(
    await prisma.notificationReceipt.findFirst({
      where: { deliveryId: row.id, channel: 'telegram' },
    }),
  ).toMatchObject({ status: 'skipped', reason: 'disabled_by_user' });
});
it('TTD-AUD-102: quiet 23:00 defers push/Telegram to civil 08:00 while email sends now', async () => {
  await api()
    .put('/api/v1/me/notifications/settings')
    .set('X-Dev-User-Email', email)
    .send({
      preferences: [
        { kind: 'task', channel: 'telegram', enabled: true },
        { kind: 'task', channel: 'email', enabled: true },
      ],
      quiet_hours: { start: '22:00', end: '08:00', days: [0, 1, 2, 3, 4, 5, 6], allow_high: false },
    })
    .expect(200);
  const now = new Date('2026-10-22T21:00:00Z');
  const row = await job(now);
  await deliverNotification(
    prisma as PrismaService,
    { deliver } as unknown as ReminderTransport,
    row,
    now,
    { title: 'Synthetic', body: 'Quiet' },
  );
  expect(deliver).toHaveBeenLastCalledWith(
    expect.objectContaining({ allowPush: false, allowTelegram: false, allowEmail: true }),
  );
  expect(
    await prisma.notificationReceipt.count({
      where: { deliveryId: row.id, status: 'skipped', reason: 'quiet_hours' },
    }),
  ).toBe(2);
  const deferred = await prisma.reminderDelivery.findMany({
    where: { ownerId, fireAt: new Date('2026-10-23T06:00:00Z') },
  });
  expect(deferred).toHaveLength(2);
});
it('TTD-AUD-102: real test endpoint uses only owned destinations and refuses recipient overrides', async () => {
  const names = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'SMTP_HOST', 'SMTP_FROM'] as const;
  const old = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) process.env[name] = 'synthetic-config';
  await prisma.pushSubscription.create({
    data: {
      ownerId,
      endpoint: 'https://push.example.test/synthetic',
      p256dh: 'synthetic',
      auth: 'synthetic',
    },
  });
  try {
    for (const channel of ['push', 'email', 'telegram']) {
      await api()
        .post('/api/v1/me/notifications/test')
        .set('X-Dev-User-Email', email)
        .send({ channel })
        .expect(201);
      expect(deliver).toHaveBeenLastCalledWith(expect.objectContaining({ email }));
    }
    await api()
      .post('/api/v1/me/notifications/test')
      .set('X-Dev-User-Email', email)
      .send({ channel: 'email', recipient: 'not-owner@example.test' })
      .expect(400);
  } finally {
    for (const name of names) {
      const value = old[name];
      if (value === undefined) Reflect.deleteProperty(process.env, name);
      else process.env[name] = value;
    }
  }
});

it('TTD-AUD-102: notification capability completes once, then rejects reuse and keeps owner isolation', async () => {
  await api()
    .put('/api/v1/me/notifications/settings')
    .set('X-Dev-User-Email', email)
    .send({ quiet_hours: { start: null, end: null, days: [], allow_high: false } })
    .expect(200);
  const row = await job(new Date());
  await deliverNotification(
    prisma as PrismaService,
    { deliver } as unknown as ReminderTransport,
    row,
    new Date(),
    { title: 'Synthetic', body: 'Action' },
  );
  const token = deliver.mock.calls.at(-1)?.[0].action?.token;
  expect(token).toBeTruthy();
  await api()
    .post(`/api/v1/reminders/${row.id}/action`)
    .send({ action: 'complete', token })
    .expect(201);
  expect(await prisma.task.findUnique({ where: { id: taskId } })).toMatchObject({
    status: 'completed',
  });
  await api()
    .post(`/api/v1/reminders/${row.id}/action`)
    .send({ action: 'snooze', token })
    .expect(401);
  const history = await api()
    .get('/api/v1/me/notifications/deliveries')
    .set('X-Dev-User-Email', email)
    .expect(200);
  expect(history.body.items.length).toBeGreaterThan(0);
  const outsider = await prisma.user.create({
    data: { email: `outsider-${randomUUID()}@example.test`, displayName: 'Synthetic outsider' },
  });
  try {
    const empty = await api()
      .get('/api/v1/me/notifications/deliveries')
      .set('X-Dev-User-Email', outsider.email)
      .expect(200);
    expect(empty.body.items).toHaveLength(0);
  } finally {
    await prisma.user.delete({ where: { id: outsider.id } });
  }
});
