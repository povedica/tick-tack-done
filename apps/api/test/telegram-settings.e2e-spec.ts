import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';
import { openField } from '../src/security/field-cipher.js';
import { ReminderTransport } from '../src/scheduler/reminder.transport.js';
import { EventRouter } from '../src/events/event-router.js';
import { hashPassword } from '../src/auth/passwords.js';
import { DomainEvent } from '../src/events/domain-events.js';

loadRootEnv();
process.env.AUTH_MODE = 'dev';
const prisma = new PrismaClient();
const tokens = [10101, 20202, 30303].map(
  (id) => `${String(id)}:${randomBytes(24).toString('base64url')}`,
);
const calls: { token: string; method: string; body: Record<string, unknown> }[] = [];
const webhooks = new Map<string, string>();
let rejectMethod = '';
let failNetwork = false;
let app: INestApplication;
let server: Parameters<typeof request>[0];
const owners: { id: string; email: string }[] = [];

function account(index: number) {
  const owner = owners[index];
  if (owner === undefined) throw new Error('Missing test account');
  return owner;
}
function configure(index: number, token: string) {
  return request(server)
    .put('/api/v1/integrations/telegram/settings')
    .set('X-Dev-User-Email', account(index).email)
    .send({ token });
}
async function stored(index: number) {
  return prisma.telegramBotConfiguration.findUniqueOrThrow({
    where: { ownerId: account(index).id },
  });
}
async function incoming(index: number, id: number, text: string, secret?: string) {
  const row = await stored(index);
  return request(server)
    .post(`/api/v1/integrations/telegram/webhook/${row.ownerId}`)
    .set('x-telegram-bot-api-secret-token', secret ?? openField(row.webhookSecret))
    .send({ update_id: id, message: { message_id: id, chat: { id: 98765 }, text } });
}
async function pairing(index: number) {
  return request(server)
    .post('/api/v1/integrations/telegram/pairing')
    .set('X-Dev-User-Email', account(index).email)
    .expect(201);
}

describe('RF-2003: bots propios desde Ajustes', () => {
  beforeAll(async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', tokens[0] ?? '');
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', randomBytes(32).toString('hex'));
    vi.stubEnv('TELEGRAM_BOT_USERNAME', 'environment_bot');
    vi.stubEnv('PUBLIC_URL', 'http://localhost:3000');
    const reply = (body: unknown, init?: ResponseInit) =>
      Promise.resolve(Response.json(body, init));
    vi.stubGlobal('fetch', (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const match = /^https:\/\/api.telegram.org\/bot([^/]+)\/(\w+)$/.exec(url);
      if (match === null) throw new Error('Unexpected network call in Telegram test');
      const token = match[1] ?? '';
      const method = match[2] ?? '';
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
        string,
        unknown
      >;
      calls.push({ token, method, body });
      if (failNetwork) throw new Error(`Network failure ${url}`);
      if (method === rejectMethod) return reply({ ok: false }, { status: 401 });
      if (method === 'getMe')
        return reply({
          ok: true,
          result: {
            id: Number(token.split(':')[0]),
            is_bot: true,
            username: `bot_${token.split(':')[0]}`,
          },
        });
      if (method === 'getWebhookInfo')
        return reply({ ok: true, result: { url: webhooks.get(token) ?? '' } });
      if (method === 'setWebhook') webhooks.set(token, String(body.url));
      return reply({ ok: true, result: { message_id: 77 } });
    });
    for (let i = 0; i < 2; i++) {
      const owner = await prisma.user.create({
        data: { email: `telegram-${randomUUID()}@reflexionia.test`, displayName: 'Telegram test' },
      });
      owners.push(owner);
      await prisma.project.create({ data: { ownerId: owner.id, name: 'Inbox', isInbox: true } });
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterAll(async () => {
    await app.close();
    const ownerId = { in: owners.map((owner) => owner.id) };
    await prisma.telegramBotConfiguration.deleteMany({ where: { ownerId } });
    await prisma.telegramUpdateReceipt.deleteMany({
      where: { updateId: { startsWith: '10101-' } },
    });
    await prisma.telegramUpdateReceipt.deleteMany({
      where: { updateId: { startsWith: '20202-' } },
    });
    await prisma.idempotencyRecord.deleteMany({ where: { ownerId } });
    await prisma.activityLog.deleteMany({ where: { ownerId } });
    await prisma.outboxEvent.deleteMany({ where: { ownerId } });
    await prisma.task.deleteMany({ where: { ownerId } });
    await prisma.project.deleteMany({ where: { ownerId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('RF-2003: ignora credenciales de entorno incluso sin bot propio', async () => {
    expect(calls).toHaveLength(0);
    const legacyLink = await prisma.telegramLink.create({
      data: { ownerId: account(0).id, chatId: '98765' },
    });
    const status = await request(server)
      .get('/api/v1/integrations/telegram')
      .set('X-Dev-User-Email', account(0).email)
      .expect(200);
    expect(status.body).toMatchObject({
      configured: false,
      linked: false,
      source: 'none',
      username: null,
      webhook_state: 'unconfigured',
    });
    await request(server)
      .post('/api/v1/integrations/telegram/pairing')
      .set('X-Dev-User-Email', account(0).email)
      .expect(503);
    await request(server)
      .post('/api/v1/integrations/telegram/webhook')
      .send({ update_id: 1 })
      .expect(410);
    const result = await app.get(ReminderTransport).deliver({
      ownerId: account(0).id,
      channel: 'push',
      email: null,
      subscriptions: [],
      telegramChatId: '98765',
      title: 'No enviar',
      body: '',
    });
    expect(result.telegram).toBe('skipped');
    await app.get(EventRouter).dispatch({
      id: randomUUID(),
      type: DomainEvent.focusSessionStarted,
      ownerId: account(0).id,
    });
    expect(calls).toHaveLength(0);
    await prisma.telegramLink.delete({ where: { id: legacyLink.id } });
  });

  it('RF-2003: cualquier cuenta guarda un bot cifrado en local sin registrar webhook', async () => {
    for (let index = 0; index < 2; index++) {
      const token = tokens[index] ?? '';
      const response = await configure(index, token).expect(200);
      expect(response.body).toMatchObject({
        configured: true,
        can_manage: true,
        webhook_state: 'local_only',
        username: `bot_${token.split(':')[0]}`,
      });
      const row = await stored(index);
      expect(row.token).toMatch(/^enc1:/);
      expect(openField(row.token)).toBe(token);
      expect(row.webhookSecret).toMatch(/^enc1:/);
      expect(JSON.stringify(response.body)).not.toContain(token);
      expect(JSON.stringify(response.body)).not.toContain(openField(row.webhookSecret));
    }
    expect(openField((await stored(0)).webhookSecret)).not.toBe(
      openField((await stored(1)).webhookSecret),
    );
    expect(calls.some((call) => call.method === 'setWebhook')).toBe(false);
    const events = await prisma.outboxEvent.findMany({
      where: {
        ownerId: { in: owners.map((owner) => owner.id) },
        type: DomainEvent.telegramBotConfigured,
      },
    });
    expect(events).toHaveLength(2);
    for (const event of events)
      expect(Object.keys(event.data as object).sort()).toEqual(['username', 'webhook_registered']);
    const history = JSON.stringify(
      await prisma.activityLog.findMany({
        where: { ownerId: { in: owners.map((owner) => owner.id) } },
      }),
    );
    for (const token of tokens) expect(history).not.toContain(token);
  });

  it('RF-2003: rechaza un bot compartido y webhooks de otros entornos incluso en local', async () => {
    await configure(1, tokens[0] ?? '').expect(409);
    const token = tokens[2] ?? '';
    webhooks.set(token, 'https://other.example.org/webhook');
    await configure(0, token).expect(409);
    expect((await stored(0)).botId).toBe('10101');
    webhooks.delete(token);
  });

  it('RF-2003: errores de Telegram no exponen token y no alteran la configuración', async () => {
    rejectMethod = 'getMe';
    const response = await configure(0, tokens[2] ?? '').expect(502);
    rejectMethod = '';
    expect(JSON.stringify(response.body)).not.toContain(tokens[2]);
    failNetwork = true;
    const network = await configure(0, tokens[2] ?? '').expect(502);
    failNetwork = false;
    expect(JSON.stringify(network.body)).not.toContain(tokens[2]);
    expect((await stored(0)).botId).toBe('10101');
    await configure(0, 'invalid').expect(400);
  });

  it('RF-2003: secreto, códigos y chat aislados; update_id iguales no colisionan entre bots', async () => {
    const a = await pairing(0);
    const b = await pairing(1);
    expect(a.body.url).toBe(`https://t.me/bot_10101?start=${String(a.body.code)}`);
    expect((await incoming(0, 1, `/start ${String(b.body.code)}`)).body.action).toBe('paired');
    expect(
      (await prisma.telegramPairing.findFirst({ where: { ownerId: account(1).id } }))?.usedAt,
    ).toBeNull();
    expect(await prisma.telegramLink.count({ where: { ownerId: account(0).id } })).toBe(0);
    await incoming(0, 2, `/start ${String(a.body.code)}`);
    await incoming(1, 2, `/start ${String(b.body.code)}`);
    expect(
      await prisma.telegramLink.count({
        where: { ownerId: { in: owners.map((owner) => owner.id) }, deletedAt: null },
      }),
    ).toBe(2);
    expect((await incoming(0, 3, 'capturar Tarea bot A')).body.action).toBe('text');
    expect((await incoming(1, 3, 'capturar Tarea bot B')).body.action).toBe('text');
    expect((await incoming(0, 3, 'duplicada')).body.action).toBe('duplicate');
    expect(await prisma.task.count({ where: { ownerId: account(0).id } })).toBe(1);
    expect(await prisma.task.count({ where: { ownerId: account(1).id } })).toBe(1);
    const otherSecret = openField((await stored(1)).webhookSecret);
    expect((await incoming(0, 4, 'no autorizado', otherSecret)).status).toBe(401);
    const sends = calls.filter((call) => call.method === 'sendMessage');
    expect(
      sends.some(
        (call) => call.token === tokens[0] && String(call.body.text).includes('Tarea bot A'),
      ),
    ).toBe(true);
    expect(
      sends.some(
        (call) => call.token === tokens[1] && String(call.body.text).includes('Tarea bot B'),
      ),
    ).toBe(true);
  });

  it('RF-2003: registra webhook propio y no guarda cambios si Telegram rechaza el registro', async () => {
    vi.stubEnv('PUBLIC_URL', 'https://todo.example.org');
    rejectMethod = 'setWebhook';
    await configure(0, tokens[0] ?? '').expect(502);
    rejectMethod = '';
    expect((await stored(0)).webhookUrl).toBeNull();
    await configure(0, tokens[0] ?? '').expect(200);
    const row = await stored(0);
    expect(webhooks.get(tokens[0] ?? '')).toBe(
      `https://todo.example.org/api/v1/integrations/telegram/webhook/${account(0).id}`,
    );
    expect(
      [...calls].reverse().find((call) => call.method === 'setWebhook')?.body.secret_token,
    ).toBe(openField(row.webhookSecret));
  });

  it('RF-2003: recordatorios y foco seleccionan el bot del propietario', async () => {
    const transport = app.get(ReminderTransport);
    calls.length = 0;
    for (let index = 0; index < 2; index++) {
      const result = await transport.deliver({
        ownerId: account(index).id,
        channel: 'push',
        email: null,
        subscriptions: [],
        telegramChatId: '98765',
        title: 'Recordatorio',
        body: '',
      });
      expect(result.telegram).toBe('sent');
      await prisma.user.update({
        where: { id: account(index).id },
        data: { focusNotifications: true },
      });
      await app.get(EventRouter).dispatch({
        id: randomUUID(),
        type: DomainEvent.focusSessionStarted,
        ownerId: account(index).id,
      });
    }
    expect(calls.filter((call) => call.method === 'sendMessage').map((call) => call.token)).toEqual(
      [tokens[0], tokens[0], tokens[1], tokens[1]],
    );
  });

  it('RF-2003: cambiar bot invalida solo los vínculos y códigos de su propietario', async () => {
    const oldSecret = openField((await stored(0)).webhookSecret);
    const a = await pairing(0);
    const b = await pairing(1);
    await configure(0, tokens[2] ?? '').expect(200);
    expect((await incoming(0, 5, 'hola', oldSecret)).status).toBe(401);
    expect(
      await prisma.telegramLink.count({ where: { ownerId: account(0).id, deletedAt: null } }),
    ).toBe(0);
    expect(
      await prisma.telegramLink.count({ where: { ownerId: account(1).id, deletedAt: null } }),
    ).toBe(1);
    expect(
      (
        await prisma.telegramPairing.findFirstOrThrow({
          where: { ownerId: account(0).id },
          orderBy: { createdAt: 'desc' },
        })
      ).usedAt,
    ).not.toBeNull();
    expect(
      (
        await prisma.telegramPairing.findFirstOrThrow({
          where: { ownerId: account(1).id },
          orderBy: { createdAt: 'desc' },
        })
      ).usedAt,
    ).toBeNull();
    expect(a.body.code).not.toBe(b.body.code);
  });
  it('RF-2003: eliminar la cuenta elimina sus credenciales sin bloquear otras cuentas', async () => {
    vi.stubEnv('SMTP_HOST', '');
    const owner = account(0);
    const password = randomBytes(24).toString('base64url');
    await prisma.user.update({
      where: { id: owner.id },
      data: { passwordHash: await hashPassword(password) },
    });
    await request(server)
      .delete('/api/v1/me')
      .set('X-Dev-User-Email', owner.email)
      .send({ confirmation: owner.email, password })
      .expect(204);
    expect(
      await prisma.telegramBotConfiguration.findUnique({ where: { ownerId: owner.id } }),
    ).toBeNull();
    expect((await stored(1)).botId).toBe('20202');
  });
});
