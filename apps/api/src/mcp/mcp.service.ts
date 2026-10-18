import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { HABIT_WEEKDAYS, proposeDaily } from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../auth/auth-user';
import { missingScopes } from '../auth/scopes';
import { DomainEvent } from '../events/domain-events';
import { EventRecorder } from '../events/event-recorder';
import { asJson } from '../http/json';
import { DomainException } from '../http/domain.exception';
import { PrismaService } from '../prisma/prisma.service';
import { loadDashboardSnapshot } from '../reading/snapshot';
import { FiltersService } from '../modules/filters/filters.service';
import { SmartListsService } from '../modules/filters/smart-lists.service';
import { HabitsService } from '../modules/habits/habits.service';
import { ListsService } from '../modules/lists/lists.service';
import { SearchService } from '../modules/search/search.service';
import { TagsService } from '../modules/tags/tags.service';
import { TasksService } from '../modules/tasks/tasks.service';
import { findTool, visibleTools } from './mcp.catalog';

const PROTOCOL = '2025-03-26';
const PROTOCOLS = new Set(['2024-11-05', '2025-03-26', '2025-06-18']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RpcSuccess {
  readonly jsonrpc: '2.0';
  readonly id: string | number | null;
  readonly result: unknown;
}

interface RpcFailure {
  readonly jsonrpc: '2.0';
  readonly id: string | number | null;
  readonly error: { readonly code: number; readonly message: string };
}

export type RpcResponse = RpcSuccess | RpcFailure;

@Injectable()
export class McpService {
  constructor(
    @Inject(TasksService) private readonly tasks: TasksService,
    @Inject(ListsService) private readonly lists: ListsService,
    @Inject(TagsService) private readonly tags: TagsService,
    @Inject(FiltersService) private readonly filters: FiltersService,
    @Inject(SmartListsService) private readonly smartLists: SmartListsService,
    @Inject(HabitsService) private readonly habits: HabitsService,
    @Inject(SearchService) private readonly search: SearchService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  async handle(user: AuthUser, body: unknown): Promise<RpcResponse | null> {
    if (!isRecord(body) || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      return failure(idOf(body) ?? null, -32600, 'Invalid Request');
    }
    const id = idOf(body);
    if (id === undefined || body.method.startsWith('notifications/')) {
      return null;
    }
    try {
      const result = await this.dispatch(user, body.method, body.params);
      return { jsonrpc: '2.0', id, result };
    } catch (error) {
      if (error instanceof DomainException) {
        const code = exceptionCode(error);
        if (code === 'method_not_found') {
          return failure(id, -32601, 'Method not found');
        }
        if (body.method === 'tools/call') {
          return { jsonrpc: '2.0', id, result: toolError(code) };
        }
        return failure(id, -32602, code);
      }
      throw error;
    }
  }

  private async dispatch(user: AuthUser, method: string, params: unknown): Promise<unknown> {
    if (method === 'initialize') {
      return this.initialize(params);
    }
    if (method === 'ping') {
      return {};
    }
    if (method === 'tools/list') {
      return {
        tools: visibleTools(user.scopes).map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    }
    if (method === 'tools/call') {
      return this.call(user, params);
    }
    throw new DomainException(HttpStatus.BAD_REQUEST, 'method_not_found', 'Method not found');
  }

  private initialize(params: unknown): unknown {
    const requested = isRecord(params) ? params.protocolVersion : undefined;
    const protocolVersion =
      typeof requested === 'string' && PROTOCOLS.has(requested) ? requested : PROTOCOL;
    return {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'reflexionia-tasks', version: '0.1.0' },
      instructions:
        'Tools call the same API v1 operations as the REST API and cannot exceed the token scopes.',
    };
  }

  private async call(user: AuthUser, params: unknown): Promise<unknown> {
    if (!isRecord(params) || typeof params.name !== 'string') {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'tool name is required',
      );
    }
    const tool = findTool(params.name);
    if (tool === undefined) {
      return toolError('unknown_tool');
    }
    const missing = missingScopes(user.scopes, tool.scopes);
    if (missing.length > 0) {
      return toolError(`scope_missing: ${missing.join(', ')}`);
    }
    const args = isRecord(params.arguments) ? params.arguments : {};
    const data = await this.run(user, tool.name, args);
    return { content: [{ type: 'text', text: JSON.stringify(data) }], isError: false };
  }

  private async run(user: AuthUser, name: string, args: Record<string, unknown>): Promise<unknown> {
    const limit = limitOf(args);
    switch (name) {
      case 'list_tasks': {
        const projectId = uuidOrEmpty(args.project_id);
        return this.tasks.list(user, {
          limit,
          ...(projectId === undefined ? {} : { projectId }),
          status: 'active',
          includeDescendants: true,
          flat: false,
          sort: 'manual',
          deleted: false,
          overdue: false,
        });
      }
      case 'get_task':
        return this.tasks.get(user, requiredUuid(args, 'id'));
      case 'create_task':
        return (
          await this.tasks.create(
            user,
            {
              title: requiredString(args, 'title', 500),
              project_id: await this.projectId(user, args),
            },
            undefined,
          )
        ).body;
      case 'complete_task':
        return (await this.tasks.complete(user, requiredUuid(args, 'id'), {}, undefined)).body;
      case 'list_projects':
        return this.lists.listProjects(user, limit, undefined, false);
      case 'create_project':
        return (
          await this.lists.createProject(
            user,
            { name: requiredString(args, 'name', 200) },
            undefined,
          )
        ).body;
      case 'list_tags':
        return this.tags.list(user, limit, undefined);
      case 'create_tag':
        return (
          await this.tags.create(user, { name: requiredString(args, 'name', 100) }, undefined)
        ).body;
      case 'list_filters':
        return this.filters.list(user, limit, undefined);
      case 'create_filter': {
        const keyword = requiredString(args, 'keyword', 200);
        return (
          await this.filters.create(
            user,
            {
              name: requiredString(args, 'name', 80),
              mode: 'normal',
              rules: {
                combinator: 'AND',
                groups: [
                  {
                    combinator: 'AND',
                    conditions: [{ field: 'keyword', op: 'contains', value: keyword }],
                  },
                ],
              },
            },
            undefined,
          )
        ).body;
      }
      case 'list_smart_lists':
        return this.smartLists.list(user);
      case 'list_smart_list_tasks':
        return this.smartLists.tasks(
          user,
          requiredString(args, 'key', 40),
          undefined,
          undefined,
          limit,
          undefined,
        );
      case 'list_habits':
        return this.habits.list(user, limit, undefined);
      case 'create_habit':
        return (
          await this.habits.create(
            user,
            {
              name: requiredString(args, 'name', 200),
              goal: { times_per_period: 1, period: 'day', target_count: 1 },
              frequency: [...HABIT_WEEKDAYS],
            },
            undefined,
          )
        ).body;
      case 'check_in_habit':
        return (
          await this.habits.checkIn(
            user,
            requiredUuid(args, 'id'),
            { date: requiredDate(args), count: countOf(args) },
            undefined,
          )
        ).body;
      case 'search':
        return this.search.search(user, requiredString(args, 'q', 200), undefined);
      case 'list_notes':
        return this.prisma.task.findMany({
          where: { ownerId: user.id, kind: 'note', deletedAt: null },
          select: { id: true, title: true, content: true, projectId: true },
          take: limit,
        });
      case 'pin_sticky_note':
        return this.prisma.$transaction(async (tx) => {
          const created = await tx.stickyNote.create({
            data: { ownerId: user.id, text: requiredString(args, 'text', 4000) },
          });
          await this.events.record(tx, actorOf(user), {
            type: DomainEvent.stickyNoteCreated,
            entityType: 'sticky_note',
            entityId: created.id,
            action: 'created',
            data: asJson({ text: created.text }),
            previous: null,
          });
          return { id: created.id, text: created.text };
        });
      case 'dashboard_snapshot':
        return loadDashboardSnapshot(this.prisma, user.id, new Date());
      case 'start_focus': {
        const minutes = typeof args.minutes === 'number' ? args.minutes : 25;
        return this.prisma.$transaction(async (tx) => {
          const created = await tx.focusSession.create({
            data: {
              ownerId: user.id,
              type: 'focus',
              plannedMinutes: minutes,
              startedAt: new Date(),
            },
          });
          await this.events.record(tx, actorOf(user), {
            type: DomainEvent.focusSessionStarted,
            entityType: 'focus_session',
            entityId: created.id,
            action: 'created',
            data: asJson({ planned_minutes: minutes }),
            previous: null,
          });
          return { id: created.id, planned_minutes: minutes };
        });
      }
      case 'review_daily': {
        const tasks = await this.prisma.task.findMany({
          where: { ownerId: user.id, deletedAt: null, status: 'active' },
          include: {
            project: { select: { name: true } },
            tags: { select: { tag: { select: { name: true } } } },
          },
          take: 100,
        });
        const now = new Date().toISOString();
        return proposeDaily(
          tasks.map((task) => ({
            id: task.id,
            title: task.title,
            priority: task.priority,
            dueDate: task.dueDate?.toISOString() ?? null,
            listId: task.projectId,
            listName: task.project.name,
            status: task.status,
            updatedAt: task.updatedAt.toISOString(),
            tagNames: task.tags.map((link) => link.tag.name),
            assigneeId: task.assigneeId,
            content: task.content,
            createdAt: task.createdAt.toISOString(),
            isAllDay: task.isAllDay,
            timeZone: task.timeZone,
          })),
          now,
          null,
          { now, timeZone: user.timeZone },
        );
      }
      default:
        throw new DomainException(HttpStatus.BAD_REQUEST, 'unknown_tool', 'Unknown tool');
    }
  }

  private async projectId(user: AuthUser, args: Record<string, unknown>): Promise<string> {
    const explicit = uuidOrEmpty(args.project_id);
    if (explicit !== undefined) {
      return explicit;
    }
    const page = await this.lists.listProjects(user, 100, undefined, true);
    const inbox = page.items.find((project) => project.is_inbox);
    if (inbox === undefined) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'project_id is required',
      );
    }
    return inbox.id;
  }
}

function exceptionCode(error: DomainException): string {
  const response: unknown = error.getResponse();
  if (isRecord(response) && typeof response.code === 'string') {
    return response.code;
  }
  return 'request_failed';
}

function toolError(text: string): { content: { type: 'text'; text: string }[]; isError: true } {
  return { content: [{ type: 'text', text }], isError: true };
}

function failure(id: string | number | null, code: number, message: string): RpcFailure {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function idOf(body: unknown): string | number | null | undefined {
  if (!isRecord(body) || !('id' in body)) {
    return undefined;
  }
  const id = body.id;
  if (id === null || typeof id === 'string' || typeof id === 'number') {
    return id;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(args: Record<string, unknown>, key: string, max: number): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > max) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', `${key} is required`);
  }
  return value.trim();
}

function requiredUuid(args: Record<string, unknown>, key: string): string {
  const value = uuidOrEmpty(args[key]);
  if (value === undefined) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', `${key} must be a uuid`);
  }
  return value;
}

function uuidOrEmpty(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'uuid is invalid');
  }
  return value;
}

function limitOf(args: Record<string, unknown>): number {
  if (args.limit === undefined) {
    return 50;
  }
  if (
    typeof args.limit !== 'number' ||
    !Number.isInteger(args.limit) ||
    args.limit < 1 ||
    args.limit > 100
  ) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'limit must be an integer from 1 to 100',
    );
  }
  return args.limit;
}

function requiredDate(args: Record<string, unknown>): string {
  const value = args.date;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'date must be YYYY-MM-DD',
    );
  }
  return value;
}

function countOf(args: Record<string, unknown>): number {
  if (args.count === undefined) {
    return 1;
  }
  if (
    typeof args.count !== 'number' ||
    !Number.isInteger(args.count) ||
    args.count < 0 ||
    args.count > 10_000
  ) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'count is invalid');
  }
  return args.count;
}
