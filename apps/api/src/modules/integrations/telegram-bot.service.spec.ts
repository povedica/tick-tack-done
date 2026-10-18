import { describe, expect, it, vi } from 'vitest';
import { TelegramBotService } from './telegram-bot.service';

describe('TelegramBotService', () => {
  it('RF-2003: nueva lista creates a project and no task', async () => {
    const createProject = vi.fn(() =>
      Promise.resolve({ statusCode: 201, body: { id: 'list' }, replayed: false }),
    );
    const createTask = vi.fn();
    const send = vi.fn(() => Promise.resolve({}));
    const prisma = {
      telegramLink: {
        findFirst: vi.fn(() => Promise.resolve({ ownerId: 'owner' })),
      },
      user: {
        findFirst: vi.fn(() =>
          Promise.resolve({
            id: 'owner',
            email: 'owner@reflexionia.test',
            timeZone: 'Europe/Madrid',
            taskCompleteChildren: 'ask',
          }),
        ),
      },
      project: {
        findFirst: vi.fn(() => Promise.resolve(null)),
        count: vi.fn(() => Promise.resolve(0)),
      },
      task: {
        count: vi.fn(() => Promise.resolve(0)),
      },
    };
    const service = new TelegramBotService(
      prisma as never,
      { record: vi.fn() } as never,
      { create: createTask } as never,
      { createProject } as never,
      { call: send } as never,
    );
    const outcome = await service.handle({
      update_id: 42,
      message: { message_id: 1, chat: { id: 7 }, text: 'nueva lista Viaje' },
    });
    expect(outcome.action).toBe('text');
    expect(createTask).not.toHaveBeenCalled();
    expect(createProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'owner' }),
      { name: 'Viaje' },
      'telegram-list-42',
    );
    expect(send).toHaveBeenCalledWith(
      'sendMessage',
      expect.objectContaining({ text: 'Lista creada: Viaje.' }),
    );
    expect(prisma.task.count).not.toHaveBeenCalled();
  });
});
