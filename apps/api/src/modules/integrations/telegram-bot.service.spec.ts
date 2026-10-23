import { describe, expect, it, vi } from 'vitest';
import { TelegramBotService } from './telegram-bot.service.js';

describe('TelegramBotService', () => {
  it('RF-2003: nueva lista creates a project and no task', async () => {
    const createProject = vi.fn(() =>
      Promise.resolve({ statusCode: 201, body: { id: 'list' }, replayed: false }),
    );
    const createTask = vi.fn();
    const send = vi.fn(() => Promise.resolve({}));
    const prisma = {
      telegramBotConfiguration: {
        findUnique: vi.fn(() =>
          Promise.resolve({
            token: 'unit-token',
            webhookSecret: 'unit_secret',
            botId: 'unit',
            username: 'unit_bot',
          }),
        ),
      },
      telegramUpdateReceipt: {
        create: vi.fn(() => Promise.resolve({})),
      },
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
      { record: vi.fn() },
      { create: createTask } as never,
      { createProject } as never,
      { call: send, withConfiguration: () => ({ call: send }) } as never,
    );
    const outcome = await service.handle(
      {
        update_id: 42,
        message: { message_id: 1, chat: { id: 7 }, text: 'nueva lista Viaje' },
      },
      'owner',
    );
    expect(outcome.action).toBe('text');
    expect(createTask).not.toHaveBeenCalled();
    expect(createProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'owner' }),
      { name: 'Viaje' },
      'telegram-list-unit-42',
    );
    expect(send).toHaveBeenCalledWith(
      'sendMessage',
      expect.objectContaining({ text: 'Lista creada: Viaje.' }),
      'owner',
    );
    expect(prisma.task.count).not.toHaveBeenCalled();
  });

  it('Q.8: a capture confirms the date, priority, tags and list', async () => {
    const createTask = vi.fn(() =>
      Promise.resolve({
        statusCode: 201,
        replayed: false,
        body: {
          id: 'task',
          project_id: 'inbox',
          title: 'Recoger a Markus del cole',
          priority: 'high',
          is_all_day: false,
          due_date: '2026-10-20T14:00:00.000Z',
          tag_ids: ['tag-cole'],
          warnings: [{ code: 'tag_created', name: 'cole' }],
        },
      }),
    );
    const send = vi.fn((_method: string, body: { text: string }) => Promise.resolve(body));
    const prisma = {
      telegramBotConfiguration: {
        findUnique: vi.fn(() =>
          Promise.resolve({
            token: 'unit-token',
            webhookSecret: 'unit_secret',
            botId: 'unit',
            username: 'unit_bot',
          }),
        ),
      },
      telegramUpdateReceipt: {
        create: vi.fn(() => Promise.resolve({})),
      },
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
        findFirst: vi.fn(() => Promise.resolve({ name: 'Bandeja de entrada' })),
      },
      tag: {
        findMany: vi.fn(() => Promise.resolve([{ id: 'tag-cole', name: 'cole' }])),
      },
    };
    const service = new TelegramBotService(
      prisma as never,
      { record: vi.fn() },
      { create: createTask } as never,
      { createProject: vi.fn() } as never,
      { call: send, withConfiguration: () => ({ call: send }) } as never,
    );
    const outcome = await service.handle(
      {
        update_id: 7,
        message: {
          message_id: 1,
          chat: { id: 7 },
          text: 'Recoger mañana a Markus del cole a las 16:00 !high #cole',
        },
      },
      'owner',
    );
    expect(outcome.action).toBe('text');
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'owner', timeZone: 'Europe/Madrid' }),
      {
        raw_text: 'Recoger mañana a Markus del cole a las 16:00 !high #cole',
        metadata: { capture: 'telegram' },
      },
      'telegram-unit-7',
    );
    const sent = send.mock.calls[0]?.[1];
    expect(sent?.text).toContain('Guardada: Recoger a Markus del cole.');
    expect(sent?.text).toContain('16:00');
    expect(sent?.text).toContain('Prioridad alta');
    expect(sent?.text).toContain('#cole');
    expect(sent?.text).toContain('Bandeja de entrada');
    expect(sent?.text).toContain('Etiqueta creada: cole.');
  });

  it('APP-07a: unlinked chats are not auto-bound to the sole owner', async () => {
    const send = vi.fn(() => Promise.resolve({}));
    const prisma = {
      telegramBotConfiguration: {
        findUnique: vi.fn(() =>
          Promise.resolve({
            token: 'unit-token',
            webhookSecret: 'unit_secret',
            botId: 'unit',
            username: 'unit_bot',
          }),
        ),
      },
      telegramUpdateReceipt: {
        create: vi.fn(() => Promise.resolve({})),
      },
      telegramLink: {
        findFirst: vi.fn(() => Promise.resolve(null)),
      },
      user: {
        findMany: vi.fn(() => Promise.resolve([{ id: 'only' }])),
      },
    };
    const service = new TelegramBotService(
      prisma as never,
      { record: vi.fn() },
      { create: vi.fn() } as never,
      { createProject: vi.fn() } as never,
      { call: send, withConfiguration: () => ({ call: send }) } as never,
    );
    const outcome = await service.handle(
      {
        update_id: 99,
        message: { message_id: 1, chat: { id: 55 }, text: 'hola' },
      },
      'owner',
    );
    expect(outcome.action).toBe('unlinked');
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      'sendMessage',
      expect.objectContaining({
        text: expect.stringContaining('código'),
      }),
      'owner',
    );
  });
});
