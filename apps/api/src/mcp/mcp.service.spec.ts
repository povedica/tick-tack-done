const transport = vi.hoisted(() => vi.fn());
vi.mock('./mcp-api.js', () => ({ requestPublicApi: transport }));
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../http/domain.exception.js';
import { McpService } from './mcp.service.js';

const user = {
  requestSource: 'mcp' as const,
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
    listLinks: vi.fn(),
    addLink: vi.fn(),
    removeLink: vi.fn(),
    listAttachments: vi.fn(),
    streamAttachment: vi.fn(),
    linkDriveFile: vi.fn(),
    deleteAttachment: vi.fn(),
    occurrences: vi.fn(),
    detach: vi.fn(),
  };
  const lists = {
    listProjects: vi.fn().mockResolvedValue({
      items: [{ id: '22222222-2222-4222-8222-222222222222', name: 'Bandeja', is_inbox: true }],
    }),
    listFolders: vi.fn(),
    createFolder: vi.fn(),
    updateFolder: vi.fn(),
    deleteFolder: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    setProjectState: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
    deletionImpact: vi.fn(),
    deleteProject: vi.fn(),
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

  const search = { search: vi.fn() };
  const closing = { replanTool: vi.fn(), discardReplan: vi.fn() };
  let service: McpService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.tag.findFirst.mockResolvedValue(null);
    service = new McpService(
      tasks as never,
      closing as never,
      lists as never,
      tags as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      search as never,
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
      'mcp',
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
      'mcp',
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
      'mcp',
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
      'mcp',
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
    expect(tasks.uncomplete).toHaveBeenCalledWith(
      user,
      '33333333-3333-4333-8333-333333333333',
      'mcp',
    );
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
      next_cursor: null,
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
  it('TTD-AUD-81: all-day next occurrence is anchored in the due date', async () => {
    tasks.get.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      repeat_rule: 'RRULE:FREQ=DAILY',
      repeat_from: 'due_date',
      due_date: '2026-10-21T22:00:00.000Z',
      start_date: null,
      is_all_day: true,
      time_zone: 'Europe/Madrid',
    });
    const response = await service.handle(user, {
      jsonrpc: '2.0',
      id: 81,
      method: 'tools/call',
      params: { name: 'get_task', arguments: { id: '33333333-3333-4333-8333-333333333333' } },
    });
    expect(JSON.parse(toolText(response))).toMatchObject({
      next_occurrence: '2026-10-22T22:00:00.000Z',
    });
  });
  it('TTD-AUD-82: parse:true resolves an existing list without case or accents', async () => {
    lists.listProjects.mockResolvedValueOnce({
      items: [
        { id: '22222222-2222-4222-8222-222222222222', name: 'Bandeja', is_inbox: true },
        { id: '55555555-5555-4555-8555-555555555555', name: 'Grókbot', is_inbox: false },
      ],
      next_cursor: null,
    });
    tasks.create.mockResolvedValue({
      body: { id: '33333333-3333-4333-8333-333333333333', title: 'Llamar', repeat_rule: null },
    });
    await service.handle(user, {
      jsonrpc: '2.0',
      id: 82,
      method: 'tools/call',
      params: { name: 'create_task', arguments: { title: 'Llamar ^grokbot', parse: true } },
    });
    expect(tasks.create).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ raw_text: 'Llamar ^grokbot' }),
      undefined,
      'mcp',
    );
  });
  it('TTD-AUD-82: complete_task forwards the explicit children decision', async () => {
    tasks.complete.mockResolvedValue({ body: { status: 'completed', repeat_rule: null } });
    await service.handle(user, {
      jsonrpc: '2.0',
      id: 82,
      method: 'tools/call',
      params: {
        name: 'complete_task',
        arguments: { id: '33333333-3333-4333-8333-333333333333', complete_children: 'complete' },
      },
    });
    expect(tasks.complete).toHaveBeenCalledWith(
      user,
      '33333333-3333-4333-8333-333333333333',
      expect.objectContaining({ complete_children: 'complete' }),
      undefined,
    );
  });
  it('TTD-AUD-82: exposes actionable pending child counts in tool error data', async () => {
    tasks.complete.mockRejectedValueOnce(
      new DomainException(HttpStatus.CONFLICT, 'children_need_decision', 'Choose children', {
        pending_checklist: 1,
        pending_children: 2,
        hint: 'retry with complete_children',
      }),
    );
    const result = await service.handle(user, {
      jsonrpc: '2.0',
      id: 82,
      method: 'tools/call',
      params: { name: 'complete_task', arguments: { id: '33333333-3333-4333-8333-333333333333' } },
    });
    expect(result).toMatchObject({
      result: { isError: true, data: { pending_checklist: 1, pending_children: 2 } },
    });
  });
  it('TTD-AUD-82: update_task accepts and forwards parent_id:null', async () => {
    tasks.get.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      repeat_rule: null,
      tag_ids: [],
      time_zone: 'Europe/Madrid',
    });
    tasks.update.mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333', parent_id: null });
    const result = await service.handle(user, {
      jsonrpc: '2.0',
      id: 82,
      method: 'tools/call',
      params: {
        name: 'update_task',
        arguments: { id: '33333333-3333-4333-8333-333333333333', parent_id: null },
      },
    });
    expect(result).toMatchObject({ result: { isError: false } });
    expect(tasks.update).toHaveBeenCalledWith(
      user,
      '33333333-3333-4333-8333-333333333333',
      expect.objectContaining({ parent_id: null }),
      'mcp',
    );
  });
  it('TTD-AUD-83: forwards inclusive start/due range selection', async () => {
    tasks.list.mockResolvedValue({ items: [], next_cursor: null });
    await service.handle(user, {
      jsonrpc: '2.0',
      id: 83,
      method: 'tools/call',
      params: {
        name: 'list_tasks',
        arguments: { from: '2026-10-22', to: '2026-10-23', range_field: 'any' },
      },
    });
    expect(tasks.list).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ from: '2026-10-22', to: '2026-10-23', rangeField: 'any' }),
    );
  });
  it('TTD-AUD-83: api_catalog exposes an opaque cursor', async () => {
    const response = await service.handle(user, {
      jsonrpc: '2.0',
      id: 83,
      method: 'tools/call',
      params: { name: 'api_catalog', arguments: { limit: 2 } },
    });
    const result = JSON.parse(toolText(response)) as { items: unknown[]; next_cursor: unknown };
    expect(result.items).toHaveLength(2);
    expect(typeof result.next_cursor).toBe('string');
  });
  it('TTD-AUD-84: start_focus uses the public lifecycle with task and stopwatch type', async () => {
    transport.mockResolvedValue({ status: 201, data: { id: 'session', type: 'stopwatch' } });
    const result = await service.handle(
      { ...user, scopes: ['focus:write'] },
      {
        jsonrpc: '2.0',
        id: 84,
        method: 'tools/call',
        params: {
          name: 'start_focus',
          arguments: { task_id: '33333333-3333-4333-8333-333333333333', type: 'stopwatch' },
        },
      },
      'Bearer synthetic',
    );
    expect(result).toMatchObject({ result: { isError: false } });
    expect(transport).toHaveBeenCalledWith(
      {
        method: 'POST',
        path: '/api/v1/focus/sessions',
        body: { task_id: '33333333-3333-4333-8333-333333333333', type: 'stopwatch' },
      },
      'Bearer synthetic',
    );
  });
  it.each(['pause_focus', 'resume_focus', 'finish_focus', 'abort_focus'])(
    'TTD-AUD-84: %s targets the current owned session',
    async (name) => {
      transport.mockImplementation((args: { method: string }) =>
        Promise.resolve({
          status: 200,
          data:
            args.method === 'GET'
              ? { session: { id: '33333333-3333-4333-8333-333333333333' } }
              : { id: '33333333-3333-4333-8333-333333333333' },
        }),
      );
      const result = await service.handle(
        { ...user, scopes: ['focus:write'] },
        { jsonrpc: '2.0', id: 84, method: 'tools/call', params: { name, arguments: {} } },
        'Bearer synthetic',
      );
      expect(result).toMatchObject({ result: { isError: false } });
      expect(transport).toHaveBeenLastCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: `/api/v1/focus/sessions/33333333-3333-4333-8333-333333333333/${name.replace('_focus', '')}`,
        }),
        'Bearer synthetic',
      );
    },
  );
  it('TTD-AUD-84: get_focus_state preserves settings and daily totals', async () => {
    transport.mockResolvedValue({
      status: 200,
      data: { session: null, settings: { pomodoroMinutes: 25 }, today: { pomos: 1, minutes: 25 } },
    });
    const response = await service.handle(
      { ...user, scopes: ['focus:write'] },
      {
        jsonrpc: '2.0',
        id: 84,
        method: 'tools/call',
        params: { name: 'get_focus_state', arguments: {} },
      },
      'Bearer synthetic',
    );
    expect(JSON.parse(toolText(response))).toMatchObject({ session: null, today: { pomos: 1 } });
  });
  it('TTD-AUD-85.1: api_request retains structured HTTP failure context', async () => {
    transport.mockRejectedValueOnce(
      new DomainException(HttpStatus.NOT_FOUND, 'task_not_found', 'Task was not found', {
        status: 404,
        code: 'task_not_found',
        message: 'Task was not found',
        body: { error: { code: 'task_not_found' } },
      }),
    );
    const result = await service.handle(
      user,
      {
        jsonrpc: '2.0',
        id: 85,
        method: 'tools/call',
        params: {
          name: 'api_request',
          arguments: { method: 'GET', path: '/api/v1/tasks/33333333-3333-4333-8333-333333333333' },
        },
      },
      'Bearer synthetic',
    );
    expect(result).toMatchObject({
      result: {
        isError: true,
        data: { status: 404, code: 'task_not_found', body: { error: { code: 'task_not_found' } } },
      },
    });
  });
  it('TTD-AUD-85.3: initialize advertises the versioned changing catalog', async () => {
    const response = await service.handle(user, {
      jsonrpc: '2.0',
      id: 85,
      method: 'initialize',
      params: {},
    });
    expect(response).toMatchObject({
      result: {
        capabilities: { tools: { listChanged: true } },
        serverInfo: { version: expect.stringMatching(/^0\.2\.0\+(?:[a-f0-9]{7}|unknown)$/) },
      },
    });
  });
  it('TTD-AUD-85.4: discard_replan forwards the owned session id', async () => {
    closing.discardReplan.mockResolvedValue({ discarded: true });
    const response = await service.handle(user, {
      jsonrpc: '2.0',
      id: 85,
      method: 'tools/call',
      params: {
        name: 'discard_replan',
        arguments: { session_id: '33333333-3333-4333-8333-333333333333' },
      },
    });
    expect(response).toMatchObject({ result: { isError: false } });
    expect(closing.discardReplan).toHaveBeenCalledWith(
      user,
      '33333333-3333-4333-8333-333333333333',
    );
  });
  it('TTD-AUD-85.8: update responses keep a compact activity summary under 2 KB', async () => {
    const task = {
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Small task',
      repeat_rule: null,
      time_zone: 'Europe/Madrid',
      tag_ids: [],
      activity: Array.from({ length: 4 }, (_, i) => ({
        id: String(i),
        created_at: '2026-10-22T10:00:00Z',
        action: 'updated',
        changes: {
          _event_type: 'task.updated@v1',
          data: { task: { title: 'old'.repeat(3000) } },
          previous: { title: 'old' },
        },
      })),
    };
    tasks.get.mockResolvedValue(task);
    tasks.update.mockResolvedValue(task);
    const response = await service.handle(user, {
      jsonrpc: '2.0',
      id: 85,
      method: 'tools/call',
      params: { name: 'update_task', arguments: { id: task.id, title: 'New title' } },
    });
    expect(Buffer.byteLength(toolText(response))).toBeLessThan(2048);
    const body = JSON.parse(toolText(response)) as { activity: unknown[] };
    expect(body.activity[0]).toMatchObject({ type: 'task.updated', changed: ['title'] });
  });
  it('TTD-AUD-85.8: get_task can explicitly request full activity', async () => {
    tasks.get.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      repeat_rule: null,
      activity: [{ changes: { task: { title: 'Full snapshot' } } }],
    });
    const response = await service.handle(user, {
      jsonrpc: '2.0',
      id: 85,
      method: 'tools/call',
      params: {
        name: 'get_task',
        arguments: { id: '33333333-3333-4333-8333-333333333333', include_activity: 'full' },
      },
    });
    expect(JSON.parse(toolText(response))).toMatchObject({
      activity: [{ changes: { task: { title: 'Full snapshot' } } }],
    });
  });

  it('TTD-AUD-102: notification tools read settings and test only the current owner', async () => {
    transport.mockResolvedValue({ status: 200, body: { sent: true } });
    const current = { ...user, scopes: ['profile:read'] };
    await service.handle(
      current,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_notification_settings', arguments: {} },
      },
      'Bearer synthetic',
    );
    expect(transport).toHaveBeenLastCalledWith(
      { method: 'GET', path: '/api/v1/me/notifications/settings' },
      'Bearer synthetic',
    );
    await service.handle(
      current,
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'send_test_notification', arguments: { channel: 'email' } },
      },
      'Bearer synthetic',
    );
    expect(transport).toHaveBeenLastCalledWith(
      { method: 'POST', path: '/api/v1/me/notifications/test', body: { channel: 'email' } },
      'Bearer synthetic',
    );
  });

  it('TTD-AUD-101: settings tool uses the public PUT contract with focus scope', async () => {
    transport.mockResolvedValue({ status: 200, body: { pomodoroMinutes: 45 } });
    await service.handle(
      { ...user, scopes: ['focus:write'] },
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'update_focus_settings', arguments: { pomodoro_minutes: 45 } },
      },
      'Bearer synthetic',
    );
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: '/api/v1/focus/settings',
        body: { pomodoro_minutes: 45 },
      }),
      'Bearer synthetic',
    );
  });

  it('TTD-AUD-100: link tools keep the authenticated owner and task', async () => {
    const id = '33333333-3333-4333-8333-333333333333';
    tasks.listLinks.mockResolvedValue({ items: [], next_cursor: null });
    tasks.addLink.mockResolvedValue({ id, url: 'https://example.com/' });
    for (const [name, args] of [
      ['list_task_links', { task_id: id }],
      ['add_task_link', { task_id: id, url: 'https://example.com/', title: 'Example' }],
      ['remove_task_link', { task_id: id, link_id: id }],
    ] as const)
      await service.handle(user, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      });
    expect(tasks.listLinks).toHaveBeenCalledWith(user, id);
    expect(tasks.addLink).toHaveBeenCalledWith(user, id, {
      url: 'https://example.com/',
      title: 'Example',
    });
    expect(tasks.removeLink).toHaveBeenCalledWith(user, id, id);
  });

  it('TTD-AUD-99: linking and removing Drive files preserve owner and the explicit trash choice', async () => {
    const id = '33333333-3333-4333-8333-333333333333';
    tasks.linkDriveFile.mockResolvedValue({
      id: 'attachment',
      web_view_link: 'https://drive.google.com/file/d/file/view',
      drive_state: 'ok',
    });
    await service.handle(user, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'link_drive_file', arguments: { task_id: id, drive_file_id: 'file' } },
    });
    expect(tasks.linkDriveFile).toHaveBeenCalledWith(user, id, 'file', 'mcp');
    await service.handle(user, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'remove_task_attachment',
        arguments: { task_id: id, attachment_id: id, trash_in_drive: true },
      },
    });
    expect(tasks.deleteAttachment).toHaveBeenCalledWith(user, id, id, true);
  });
  it.each(['completed', 'cancelled', 'archived'])(
    'TTD-AUD-118: %s occurrences never expose a next occurrence',
    async (status) => {
      tasks.get.mockResolvedValue({
        id: '33333333-3333-4333-8333-333333333333',
        status,
        repeat_rule: 'RRULE:FREQ=DAILY',
        due_date: '2030-01-01T09:00:00Z',
      });
      const result = await service.handle(user, {
        jsonrpc: '2.0',
        id: 118,
        method: 'tools/call',
        params: { name: 'get_task', arguments: { id: '33333333-3333-4333-8333-333333333333' } },
      });
      expect(JSON.parse(toolText(result)).next_occurrence).toBeNull();
    },
  );
  it('TTD-AUD-119: search task groups contain only ids and preserve list groups', async () => {
    const item = { id: 'task', title: 'long task'.repeat(1000), type: 'task' };
    const list = { id: 'list', name: 'List' };
    const original = {
      items: [item],
      next_cursor: null,
      groups: [
        { type: 'task', items: [item] },
        { type: 'list', items: [list] },
      ],
    };
    search.search.mockResolvedValue(original);
    const response = await service.handle(user, {
      jsonrpc: '2.0',
      id: 119,
      method: 'tools/call',
      params: { name: 'search', arguments: { q: 'long task' } },
    });
    const result = JSON.parse(toolText(response));
    expect(result.groups).toEqual([
      { type: 'task', ids: ['task'], count: 1 },
      { type: 'list', items: [list] },
    ]);
    expect(result.items).toEqual([item]);
    expect(JSON.stringify(result).length).toBeLessThan(JSON.stringify(original).length * 0.55);
  });
  it('TTD-AUD-111: catalog exposes direct streaming upload with the authenticated owner', async () => {
    const catalog = await service.handle(user, { jsonrpc: '2.0', id: 111, method: 'tools/list' });
    expect(JSON.stringify(catalog)).toContain('upload_task_attachment');
    tasks.streamAttachment.mockResolvedValue({ source: 'mcp', drive_state: 'ok' });
    const result = await service.handle(user, {
      jsonrpc: '2.0',
      id: 111,
      method: 'tools/call',
      params: {
        name: 'upload_task_attachment',
        arguments: {
          task_id: '33333333-3333-4333-8333-333333333333',
          filename: 'note.txt',
          base64: Buffer.from('hello').toString('base64'),
        },
      },
    });
    expect(JSON.parse(toolText(result))).toEqual({ source: 'mcp', drive_state: 'ok' });
    expect(tasks.streamAttachment).toHaveBeenCalledWith(
      user,
      '33333333-3333-4333-8333-333333333333',
      'note.txt',
      expect.anything(),
      'mcp',
    );
  });

  it('calls each list and project tool, and delete_project confirms in two steps', async () => {
    const listsUser = { ...user, scopes: ['lists:read', 'lists:write'] };
    const id = '22222222-2222-4222-8222-222222222222';
    const call = (name: string, args: Record<string, unknown> = {}) =>
      service.handle(listsUser, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      });
    lists.listFolders.mockResolvedValue({ items: [], next_cursor: null });
    lists.createFolder.mockResolvedValue({ body: { id, name: 'Personal' } });
    lists.updateFolder.mockResolvedValue({ id, name: 'Casa' });
    lists.deleteFolder.mockResolvedValue({ movedListIds: [id] });
    lists.createProject.mockResolvedValue({ body: { id, name: 'reforma' } });
    lists.updateProject.mockResolvedValue({ id, folder_id: id });
    lists.setProjectState.mockResolvedValue({ body: { id, state: 'paused' } });
    lists.archive.mockResolvedValue({ body: { id, closed: true } });
    lists.unarchive.mockResolvedValue({ body: { id, closed: false, project_status: 'active' } });
    lists.listProjects.mockResolvedValue({ items: [{ id, state: 'archived' }], next_cursor: null });
    lists.deletionImpact.mockResolvedValue({
      project_id: id,
      name: 'reforma',
      is_project: true,
      closed: true,
      task_count: 2,
      completed_count: 1,
      open_count: 1,
      subtask_count: 0,
    });

    expect(JSON.parse(toolText(await call('list_folders')))).toEqual({
      items: [],
      next_cursor: null,
    });
    expect(lists.listFolders).toHaveBeenCalledWith(listsUser, 50, undefined);

    await call('create_folder', { name: 'Personal' });
    expect(lists.createFolder).toHaveBeenCalledWith(
      listsUser,
      { name: 'Personal' },
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    );

    await call('update_folder', { id, name: 'Casa' });
    expect(lists.updateFolder).toHaveBeenCalledWith(listsUser, id, { name: 'Casa' });

    expect(JSON.parse(toolText(await call('delete_folder', { id })))).toEqual({
      deleted: true,
      moved_list_ids: [id],
    });

    await call('create_project', { name: 'reforma', is_project: true, outcome: 'Cocina' });
    expect(lists.createProject).toHaveBeenCalledWith(
      listsUser,
      expect.objectContaining({ name: 'reforma', is_project: true, outcome: 'Cocina' }),
      expect.any(String),
    );

    await call('list_projects', { state: 'archived', folder_id: 'none', is_project: true });
    expect(lists.listProjects).toHaveBeenCalledWith(listsUser, 50, undefined, false, {
      folderId: null,
      isProject: true,
      state: 'archived',
    });

    await call('update_project', { id, folder_id: id });
    expect(lists.updateProject).toHaveBeenCalledWith(listsUser, id, { folder_id: id });

    await call('set_project_state', { id, state: 'paused' });
    expect(lists.setProjectState).toHaveBeenCalledWith(listsUser, id, 'paused', undefined);

    await call('archive_project', { id });
    expect(lists.archive).toHaveBeenCalledWith(listsUser, id, undefined);
    await call('unarchive_project', { id });
    expect(lists.unarchive).toHaveBeenCalledWith(listsUser, id, undefined);

    const preview = JSON.parse(toolText(await call('delete_project', { id, dry_run: true })));
    expect(preview).toMatchObject({
      deleted: false,
      task_count: 2,
      hint: 'Call again with confirm_task_count=<task_count> to delete.',
    });
    expect(lists.deleteProject).not.toHaveBeenCalled();

    const removed = JSON.parse(
      toolText(await call('delete_project', { id, confirm_task_count: 2 })),
    );
    expect(removed.deleted).toBe(true);
    expect(lists.deleteProject).toHaveBeenCalledWith(listsUser, id, 2);
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
