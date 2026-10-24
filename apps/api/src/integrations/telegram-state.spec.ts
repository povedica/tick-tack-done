import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyTelegramState,
  telegramState,
  type TelegramStateConfiguration,
  type TelegramStateLink,
} from './telegram-state.js';
import type { PrismaService } from '../prisma/prisma.service.js';
const configuration: TelegramStateConfiguration = {
  botId: '42',
  username: 'test_bot',
  webhookUrl: 'https://todo.example.org/api/v1/integrations/telegram/webhook/owner',
  updatedAt: new Date(),
};
const link: TelegramStateLink = {
  botId: '42',
  chatId: '1',
  status: 'connected',
  username: null,
  displayName: 'Test',
  createdAt: new Date(),
};
afterEach(() => vi.unstubAllEnvs());
export const scenarios = [
  ['none', null, null],
  ['token_saved', { ...configuration, webhookUrl: null }, link],
  ['webhook_ok', configuration, null],
  ['linked', configuration, link],
  ['blocked', configuration, { ...link, status: 'blocked' }],
  ['error', { ...configuration, webhookUrl: '' }, link],
] as const;
describe('RF-2003: single persisted Telegram state', () => {
  it.each(scenarios)('classifies %s consistently without network', async (state, config, chat) => {
    vi.stubEnv('PUBLIC_URL', 'https://todo.example.org');
    const fetch = vi.spyOn(globalThis, 'fetch');
    const prisma = {
      telegramBotConfiguration: { findUnique: vi.fn().mockResolvedValue(config) },
      telegramLink: { findFirst: vi.fn().mockResolvedValue(chat) },
    };
    const result = await telegramState(prisma as unknown as PrismaService, 'owner');
    expect(result.state).toBe(state);
    expect(result.linked).toBe(state === 'linked');
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it('does not reuse bot A link with bot B, or a foreign webhook', () => {
    expect(
      classifyTelegramState(configuration, { ...link, botId: 'other' }, configuration.webhookUrl),
    ).toBe('webhook_ok');
    expect(classifyTelegramState(configuration, link, 'https://other.example.org')).toBe('error');
  });
});
