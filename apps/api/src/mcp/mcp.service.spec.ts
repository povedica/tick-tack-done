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
    occurrences: vi.fn(),
    detach: vi.fn(),
  };
  const lists = {
    listProjects: vi.fn().mockResolvedValue({
      items: [{ id: '22222222-2222-4222-8222-222222222222', is_inbox: true }],
    }),
  };

  let service: McpService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new McpService(
      tasks as never,
      {} as never,
      lists as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
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
    );
    const text = JSON.parse(firstToolText(result)) as { repeat_label: string; next_occurrence: string | null };
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
    expect(
      firstToolText(result),
    ).toContain('a repeating task needs a due_date');
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
    expect(
      firstToolText(result),
    ).toContain('use either recurrence or repeat_rule, not both');
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
      new DomainException(HttpStatus.BAD_REQUEST, 'invalid_zone', 'time_zone must be an IANA name like Europe/Madrid'),
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
    expect(
      firstToolText(result),
    ).toBe('invalid_zone: time_zone must be an IANA name like Europe/Madrid');
  });
});

function firstToolText(result: unknown): string {
  const content = (result as { result: { content: { text: string }[] } }).result.content[0];
  if (content === undefined) {
    throw new Error('missing tool text');
  }
  return content.text;
}

