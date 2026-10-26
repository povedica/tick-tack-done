import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ReminderTransport } from '../scheduler/reminder.transport.js';
import { deliverNotification } from './deliver.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('RF-2003: Telegram delivery shares the canonical state and records every skipped reason', () => {
  it.each([
    ['none', null, null, 'not_configured'],
    ['token_saved', null, '42', 'not_linked'],
    [
      'webhook_ok',
      'https://todo.example.org/api/v1/integrations/telegram/webhook/owner',
      null,
      'not_linked',
    ],
    [
      'blocked',
      'https://todo.example.org/api/v1/integrations/telegram/webhook/owner',
      '42',
      'blocked',
    ],
    ['error', '', '42', 'not_linked'],
  ])(
    '%s never sends and leaves an explicit receipt',
    async (_state, webhookUrl, linkBotId, reason) => {
      vi.stubEnv('PUBLIC_URL', 'https://todo.example.org');
      const config =
        _state === 'none'
          ? null
          : { botId: '42', webhookUrl, username: 'test_bot', updatedAt: new Date() };
      const link = linkBotId
        ? {
            botId: linkBotId,
            chatId: 'valid',
            status: _state === 'blocked' ? 'blocked' : 'connected',
            createdAt: new Date(),
          }
        : null;
      const receipt = vi.fn();
      const prisma = {
        telegramBotConfiguration: { findUnique: vi.fn().mockResolvedValue(config) },
        telegramLink: { findFirst: vi.fn().mockResolvedValue(link) },
        user: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            email: null,
            telegramEnabled: true,
            timeZone: 'UTC',
            quietHoursStart: null,
            quietHoursEnd: null,
            quietHoursDays: [],
            quietAllowHigh: false,
            telegramLinks: link ? [link] : [],
            pushSubscriptions: [],
            notificationPreferences: [],
          }),
        },
        notificationReceipt: { create: receipt },
      } as unknown as PrismaService;
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const result = await deliverNotification(
        prisma,
        new ReminderTransport(prisma),
        {
          id: 'delivery',
          ownerId: 'owner',
          kind: 'task',
          taskId: null,
          payload: { notification_channels: ['telegram'] },
          fireAt: new Date(),
        },
        new Date(),
        { title: 'Test', body: '' },
      );
      expect(result).toMatchObject({ telegram: 'skipped', telegram_reason: reason });
      expect(receipt).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ channel: 'telegram', reason }) }),
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
