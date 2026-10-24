import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { sealField } from '../src/security/field-cipher.js';
import { deliverNotification } from '../src/notifications/deliver.js';
import { ReminderTransport } from '../src/scheduler/reminder.transport.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
const prisma = new PrismaClient();
let app: INestApplication;
let ownerId: string;
let email: string;
let blocked = false;
const calls: { method: string; body: Record<string, unknown> }[] = [];
beforeAll(async () => {
  vi.stubEnv('AUTH_MODE', 'dev');
  vi.stubEnv('PUBLIC_URL', 'https://todo.example.org');
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown, init?: RequestInit) => {
      const method = String(url).split('/').at(-1) ?? '';
      const body =
        typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      calls.push({ method, body });
      return Promise.resolve(
        new Response(
          JSON.stringify(
            method === 'getMe'
              ? { ok: true, result: { username: 'synthetic_bot' } }
              : blocked
                ? { ok: false, description: 'Forbidden: bot was blocked by the user' }
                : { ok: true, result: { message_id: 123 } },
          ),
          { status: blocked && method === 'sendMessage' ? 403 : 200 },
        ),
      );
    }),
  );
  const owner = await prisma.user.create({
    data: {
      email: `guided-telegram-${randomUUID()}@example.test`,
      displayName: 'Synthetic Telegram',
    },
  });
  ownerId = owner.id;
  email = owner.email;
  await prisma.telegramBotConfiguration.create({
    data: {
      ownerId,
      botId: '77103',
      webhookUrl: `https://todo.example.org/api/v1/integrations/telegram/webhook/${ownerId}`,
      username: 'synthetic_bot',
      token: sealField('synthetic-token'),
      webhookSecret: sealField('synthetic-webhook-secret'),
    },
  });
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
    await prisma.telegramBotConfiguration.deleteMany({ where: { ownerId } });
    await prisma.user.delete({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function api() {
  return request(app.getHttpServer() as Parameters<typeof request>[0]);
}
it('TTD-AUD-103: saved bot creates a ten-minute deep link, owned webhook pairs and exposes the profile', async () => {
  const response = await api()
    .post('/api/v1/integrations/telegram/pairing')
    .set('X-Dev-User-Email', email)
    .expect(201);
  expect(response.body.deep_link).toBe(
    `https://t.me/synthetic_bot?start=${String(response.body.code)}`,
  );
  expect(Date.parse(String(response.body.expires_at)) - Date.now()).toBeGreaterThan(590000);
  await api()
    .post(`/api/v1/integrations/telegram/webhook/${ownerId}`)
    .set('X-Telegram-Bot-Api-Secret-Token', 'synthetic-webhook-secret')
    .send({
      update_id: Date.now(),
      message: {
        chat: { id: 77103, type: 'private' },
        from: { username: 'test', first_name: 'Synthetic' },
        text: `/start ${String(response.body.code)}`,
      },
    })
    .expect(200);
  const status = await api()
    .get('/api/v1/integrations/telegram')
    .set('X-Dev-User-Email', email)
    .expect(200);
  expect(status.body).toMatchObject({
    linked: true,
    username: 'test',
    display_name: 'Synthetic',
    status: 'connected',
    enabled: true,
  });
  expect(calls.filter((call) => call.method === 'getMe')).toHaveLength(0);
});
it('TTD-AUD-103: 403 marks blocked in integration and matrix, recheck restores it, unlink sends farewell', async () => {
  blocked = true;
  await api()
    .post('/api/v1/me/notifications/test')
    .set('X-Dev-User-Email', email)
    .send({ channel: 'telegram' })
    .expect(409);
  const status = await api()
    .get('/api/v1/integrations/telegram')
    .set('X-Dev-User-Email', email)
    .expect(200);
  expect(status.body.status).toBe('blocked');
  const matrix = await api()
    .get('/api/v1/me/notifications/settings')
    .set('X-Dev-User-Email', email)
    .expect(200);
  expect(matrix.body.channels.telegram.status).toBe('blocked');
  blocked = false;
  await api()
    .post('/api/v1/integrations/telegram/recheck')
    .set('X-Dev-User-Email', email)
    .expect(201);
  expect(
    await prisma.telegramLink.findFirst({ where: { ownerId, deletedAt: null } }),
  ).toMatchObject({ status: 'connected' });
  await api().delete('/api/v1/integrations/telegram').set('X-Dev-User-Email', email).expect(204);
  expect(calls.at(-1)?.body.text).toBe('Desvinculado de tick-tack-done');
  const row = await prisma.reminderDelivery.create({
    data: { ownerId, kind: 'task', dedupeKey: randomUUID(), fireAt: new Date(), channel: 'push' },
  });
  await deliverNotification(prisma as PrismaService, app.get(ReminderTransport), row, new Date(), {
    title: 'Synthetic',
    body: 'After unlink',
  });
  expect(
    await prisma.notificationReceipt.findFirst({
      where: { deliveryId: row.id, channel: 'telegram' },
    }),
  ).toMatchObject({ status: 'skipped', reason: 'not_linked' });
});
