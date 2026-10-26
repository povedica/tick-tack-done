import { randomBytes } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { sealField } from '../security/field-cipher.js';
import { ReminderTransport } from './reminder.transport.js';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it('RF-2003: a late 401 from an old token cannot invalidate a replacement for the same bot', async () => {
  vi.stubEnv('PUBLIC_URL', 'https://todo.example.org');
  vi.stubEnv('APP_SECRET', randomBytes(32).toString('hex'));
  const url = 'https://todo.example.org/api/v1/integrations/telegram/webhook/owner';
  let row = {
    botId: '42',
    username: 'test_bot',
    token: sealField(`42:${randomBytes(24).toString('base64url')}`),
    webhookSecret: sealField('synthetic-webhook-secret'),
    webhookUrl: url,
    updatedAt: new Date(),
  };
  const configuration = {
    findUnique: vi.fn(() => Promise.resolve(row)),
    updateMany: vi.fn(
      (args: { where: { token?: string; updatedAt?: Date }; data: { webhookUrl: string } }) => {
        if (
          (args.where.token !== undefined && args.where.token !== row.token) ||
          (args.where.updatedAt !== undefined &&
            args.where.updatedAt.getTime() !== row.updatedAt.getTime())
        )
          return Promise.resolve({ count: 0 });
        row = { ...row, ...args.data };
        return Promise.resolve({ count: 1 });
      },
    ),
  };
  const tx = {
    telegramBotConfiguration: configuration,
    telegramLink: {
      findFirst: vi.fn().mockResolvedValue({
        botId: '42',
        chatId: 'current',
        status: 'connected',
        username: null,
        displayName: 'Synthetic',
        createdAt: new Date(),
      }),
    },
    $executeRaw: vi.fn(),
    outboxEvent: { create: vi.fn() },
    activityLog: { create: vi.fn() },
  };
  const prisma = {
    ...tx,
    $transaction: <T>(callback: (client: typeof tx) => Promise<T>) => callback(tx),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      row = {
        ...row,
        token: sealField(`42:${randomBytes(24).toString('base64url')}`),
        updatedAt: new Date(row.updatedAt.getTime() + 1),
      };
      return Promise.resolve(Response.json({ ok: false }, { status: 401 }));
    }),
  );
  const result = await new ReminderTransport(prisma as unknown as PrismaService).deliver({
    ownerId: 'owner',
    channel: 'push',
    allowPush: false,
    email: null,
    subscriptions: [],
    telegramChatId: 'obsolete',
    title: 'Synthetic',
    body: '',
  });
  expect(result.telegram).toBe('failed');
  expect(row.webhookUrl).toBe(url);
  expect(tx.outboxEvent.create).not.toHaveBeenCalled();
});
