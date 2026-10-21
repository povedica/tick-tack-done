import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../http/domain.exception.js';
import { McpService } from './mcp.service.js';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'mcp@test',
  displayName: 'MCP',
  timeZone: 'Europe/Madrid',
  weekStartsOn: 1 as const,
  completeChildren: 'ask' as const,
  scopes: ['tasks:read', 'tasks:write'],
  tokenId: null,
  sessionId: null,
  listIds: null,
};

describe('McpService recurrence mapping', () => {
  const tasks = {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    complete: vi.fn(),
    uncomplete: vi.fn(),
    cancel: vi.fn(),
    remove: vi.fn(),
    restore: vi.fn(),
    move: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    completeItem: vi.fn(),
    uncompleteItem: vi.fn(),
    listAttachments: vi.fn(),
    occurrences: vi.fn(),
    detach: vi.fn(),
  };
  const lists = {
    listProjects: vi.fn().mockResolvedValue({
      items: [{ id: '22222222-2222-4222-8222-222222222222', is_inbox: true }],
    }),
  };
  const tags = {
    create: vi.fn().mockResolvedValue({
      body: { id: '44444444-4444-4444-8444-444444444444', name: 'Instinct' },
    }),
  };
  const prisma = {
    tag: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    activityLog: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    comment: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };

  let service: McpService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.tag.findFirst.mockResolvedValue(null);
    service = new McpService(
      tasks as never,
      {} as never,
      lists as never,
      tags as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      prisma as never,
      {} as never,
    );
  });

  it('RF-2007: create_task with recurrence builds an RRULE for TasksService', async () => {
    tasks.create.mockResolvedValue({
      body: {
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Pagar',
        repeat_rule: 'RRULE:FREQ=MONTHLY;BYMONTHDAY=19',
        time_zone: 'Europe/Madrid',
        due_date: '2026-10-19T08:00:00.000Z',
      },
      statusCode: 201,
      replayed: false,
    });

    const result = await service.handle(user, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'create_task',
        arguments: {
          title: 'Pagar',
          due_date: '2026-10-19T08:00:00.000Z',
          recurrence: { freq: 'monthly', month_day: 19 },
          repeat_from: 'due_date',
        },
      },
    });

    expect(result).toMatchObject({ jsonrpc: '2.0', id: 1 });
    expect(tasks.create).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        title: 'Pagar',
        repeat_rule: 'RRULE:FREQ=MONTHLY;BYMONTHDAY=19',
        repeat_from: 'due_date',
      }),
      undefined,
      'api',
    );
    const text = JSON.parse(toolText(result)) as {
      repeat_label: string;
      next_occurrence: string | null;
    };
    expect(text.repeat_label).toBe('El día 19 de cada mes');
  });

  it('RF-2014: recurrence without due_date returns missing_anchor', async () => {
    const result = await service.handle(user, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'create_task',
        arguments: { title: 'Sin ancla', recurrence: { freq: 'daily' } },
      },
    });
    expect(result).toMatchObject({
      result: {
        isError: true,
        content: [{ text: expect.stringContaining('missing_anchor') }],
      },
    });
    expect(toolText(result)).toContain('a repeating task needs a due_date');
    expect(tasks.create).not.toHaveBeenCalled();
  });

  it('RF-2008: recurrence and repeat_rule together are rejected', async () => {
    const result = await service.handle(user, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'create_task',
        arguments: {
          title: 'Ambos',
          due_date: '2026-10-19T08:00:00.000Z',
          recurrence: { freq: 'daily' },
          repeat_rule: 'RRULE:FREQ=WEEKLY',
        },
      },
    });
    expect(toolText(result)).toContain('use either recurrence or repeat_rule, not both');
  });

  it('RF-2007: update_task recurrence null clears the series', async () => {
    tasks.get.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      due_date: '2026-10-19T08:00:00.000Z',
      repeat_rule: 'RRULE:FREQ=DAILY',
      time_zone: 'Europe/Madrid',
    });
    tasks.update.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      repeat_rule: null,
      time_zone: 'Europe/Madrid',
    });

    await service.handle(user, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'update_task',
        arguments: {
          id: '33333333-3333-4333-8333-333333333333',
          recurrence: null,
        },
      },
    });

    expect(tasks.update).toHaveBeenCalledWith(
      user,
      '33333333-3333-4333-8333-333333333333',
      expect.objectContaining({ repeat_rule: null }),
    );
  });

  it('RF-2014: weekdays on a non-weekly recurrence fail clearly', async () => {
    await expect(
      service.handle(user, {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'create_task',
          arguments: {
            title: 'Mal',
            due_date: '2026-10-19T08:00:00.000Z',
            recurrence: { freq: 'daily', weekdays: ['MO'] },
          },
        },
      }),
    ).resolves.toMatchObject({
      result: {
        isError: true,
        content: [
          {
            text: expect.stringContaining('weekdays only applies to weekly recurrence'),
          },
        ],
      },
    });
  });

  it('RF-2012: complete_task forwards advance and materialize_next', async () => {
    tasks.complete.mockResolvedValue({
      body: {
        id: '33333333-3333-4333-8333-333333333333',
        status: 'completed',
        repeat_rule: 'RRULE:FREQ=MONTHLY',
        time_zone: 'Europe/Madrid',
        series: {
          materialized: true,
          next_due_date: '2026-11-19T08:00:00.000Z',
          eta_seconds: null,
        },
      },
      statusCode: 200,
      replayed: false,
    });

    await service.handle(user, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'complete_task',
        arguments: {
          id: '33333333-3333-4333-8333-333333333333',
          advance: 'next_future',
          materialize_next: true,
        },
      },
    });

    expect(tasks.complete).toHaveBeenCalledWith(
      user,
      '33333333-3333-4333-8333-333333333333',
      { advance: 'next_future', materialize_next: true },
      undefined,
    );
  });

  it('maps DomainException messages into tool errors', async () => {
    tasks.create.mockRejectedValue(
      new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_zone',
        'time_zone must be an IANA name like Europe/Madrid',
      ),
    );

    const result = await service.handle(user, {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'create_task',
        arguments: { title: 'Zona', due_date: '2026-10-19T08:00:00.000Z' },
      },
    });
    expect(toolText(result)).toBe(
      'invalid_zone: time_zone must be an IANA name like Europe/Madrid',
    );
  });

  it('TTD-AUD-54: rejects unknown update_task fields without calling the service', async () => {
    const result = await service.handle(user, {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'update_task',
        arguments: {
          id: '33333333-3333-4333-8333-333333333333',
          status: 'completed',
        },
      },
    });
    expect(tasks.update).not.toHaveBeenCalled();
    const body = result as { result: { isError: true; content: { text: string }[] } };
    expect(body.result.isError).toBe(true);
    expect(toolText(result)).toContain('Campos no admitidos: status');
  });

  it('TTD-AUD-48: create_task with tags creates missing names and passes tag_ids', async () => {
    tasks.create.mockResolvedValue({
      body: {
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Asignar',
        tag_ids: ['44444444-4444-4444-8444-444444444444'],
      },
      statusCode: 201,
      replayed: false,
    });
    await service.handle(user, {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'create_task',
        arguments: { title: 'Asignar', tags: ['Instinct'] },
      },
    });
    expect(tags.create).toHaveBeenCalled();
    expect(tasks.create).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        title: 'Asignar',
        tag_ids: ['44444444-4444-4444-8444-444444444444'],
      }),
      undefined,
      'api',
    );
  });

  it('TTD-AUD-49: quick_add forwards raw_text to TasksService', async () => {
    tasks.create.mockResolvedValue({
      body: {
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Prueba parser',
        tag_ids: ['44444444-4444-4444-8444-444444444444'],
      },
      statusCode: 201,
      replayed: false,
    });
    await service.handle(user, {
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'quick_add',
        arguments: { text: 'Prueba parser #Instinct mañana 09:00-09:30' },
      },
    });
    expect(tasks.create).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        raw_text: 'Prueba parser #Instinct mañana 09:00-09:30',
      }),
      undefined,
      'api',
    );
  });

  it('TTD-AUD-53: reopen_task and cancel_task call TasksService', async () => {
    tasks.uncomplete.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      status: 'active',
    });
    tasks.cancel.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      status: 'cancelled',
    });
    await service.handle(user, {
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: {
        name: 'reopen_task',
        arguments: { id: '33333333-3333-4333-8333-333333333333' },
      },
    });
    expect(tasks.uncomplete).toHaveBeenCalledWith(user, '33333333-3333-4333-8333-333333333333');
    await service.handle(user, {
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: {
        name: 'cancel_task',
        arguments: { id: '33333333-3333-4333-8333-333333333333' },
      },
    });
    expect(tasks.cancel).toHaveBeenCalledWith(user, '33333333-3333-4333-8333-333333333333');
  });

  it('TTD-AUD-50: delete_task soft-deletes via remove', async () => {
    tasks.remove.mockResolvedValue(undefined);
    const trashUser = { ...user, scopes: [...user.scopes, 'tasks:trash'] };
    const result = await service.handle(trashUser, {
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/call',
      params: {
        name: 'delete_task',
        arguments: { id: '33333333-3333-4333-8333-333333333333' },
      },
    });
    expect(tasks.remove).toHaveBeenCalledWith(trashUser, '33333333-3333-4333-8333-333333333333');
    expect(JSON.parse(toolText(result))).toEqual({ deleted: true, trashed: true });
  });

  it('TTD-AUD-51: list_task_comments loads prisma comments', async () => {
    tasks.get.mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333' });
    prisma.comment.findMany.mockResolvedValue([
      {
        id: '55555555-5555-4555-8555-555555555555',
        body: 'Hola @Ana',
        authorId: user.id,
      },
    ]);
    const result = await service.handle(user, {
      jsonrpc: '2.0',
      id: 14,
      method: 'tools/call',
      params: {
        name: 'list_task_comments',
        arguments: { task_id: '33333333-3333-4333-8333-333333333333' },
      },
    });
    expect(JSON.parse(toolText(result))).toEqual({
      items: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          body: 'Hola @Ana',
          author_id: user.id,
          mentions: ['ana'],
        },
      ],
    });
  });

  it('TTD-AUD-52: move_task forwards project_id', async () => {
    tasks.move.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      project_id: '22222222-2222-4222-8222-222222222222',
    });
    await service.handle(user, {
      jsonrpc: '2.0',
      id: 15,
      method: 'tools/call',
      params: {
        name: 'move_task',
        arguments: {
          id: '33333333-3333-4333-8333-333333333333',
          project_id: '22222222-2222-4222-8222-222222222222',
        },
      },
    });
    expect(tasks.move).toHaveBeenCalledWith(user, '33333333-3333-4333-8333-333333333333', {
      project_id: '22222222-2222-4222-8222-222222222222',
    });
  });
});

function toolText(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('result' in body)) {
    throw new Error('missing tool result');
  }
  const result = body.result;
  if (typeof result !== 'object' || result === null || !('content' in result)) {
    throw new Error('missing tool content');
  }
  const content = result.content;
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error('missing tool content');
  }
  const first: unknown = content[0];
  if (
    typeof first !== 'object' ||
    first === null ||
    !('text' in first) ||
    typeof first.text !== 'string'
  ) {
    throw new Error('missing tool text');
  }
  return first.text;
}
