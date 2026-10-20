import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  buildRepeatRule,
  civilDateKey,
  describeRepeatRule,
  firstAfter,
  HABIT_WEEKDAYS,
  parseRepeatRule,
  proposeDaily,
  type PlanDecisionKind,
  type RepeatDraft,
  type Weekday,
} from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../auth/auth-user.js';
import { missingScopes } from '../auth/scopes.js';
import { DomainEvent } from '../events/domain-events.js';
import { EventRecorder } from '../events/event-recorder.js';
import { asJson } from '../http/json.js';
import { DomainException } from '../http/domain.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { loadDashboardSnapshot } from '../reading/snapshot.js';
import { FiltersService } from '../modules/filters/filters.service.js';
import { SmartListsService } from '../modules/filters/smart-lists.service.js';
import { CountdownsService } from '../modules/countdowns/countdowns.service.js';
import { HabitsService } from '../modules/habits/habits.service.js';
import { ListsService } from '../modules/lists/lists.service.js';
import { SearchService } from '../modules/search/search.service.js';
import { TagsService } from '../modules/tags/tags.service.js';
import { DayClosingService } from '../modules/planning/day-closing.service.js';
import { TasksService } from '../modules/tasks/tasks.service.js';
import { CalendarService } from '../modules/calendar/calendar.service.js';
import { findTool, visibleTools } from './mcp.catalog.js';

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
    @Inject(DayClosingService) private readonly closing: DayClosingService,
    @Inject(ListsService) private readonly lists: ListsService,
    @Inject(TagsService) private readonly tags: TagsService,
    @Inject(FiltersService) private readonly filters: FiltersService,
    @Inject(SmartListsService) private readonly smartLists: SmartListsService,
    @Inject(HabitsService) private readonly habits: HabitsService,
    @Inject(CountdownsService) private readonly countdowns: CountdownsService,
    @Inject(CalendarService) private readonly calendars: CalendarService,
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
        const message = exceptionMessage(error);
        if (code === 'method_not_found') {
          return failure(id, -32601, 'Method not found');
        }
        if (body.method === 'tools/call') {
          return { jsonrpc: '2.0', id, result: toolError(code, message) };
        }
        return failure(id, -32602, message.length > 0 ? `${code}: ${message}` : code);
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
        const cursor = cursorOf(args);
        const page = await this.tasks.list(user, {
          limit,
          ...(cursor === undefined ? {} : { cursor }),
          ...(projectId === undefined ? {} : { projectId }),
          status: 'active',
          includeDescendants: true,
          flat: false,
          sort: 'manual',
          deleted: false,
          overdue: false,
          someday: args.someday === true,
        });
        return {
          ...page,
          items: page.items.map((item) => enrichTask(item)),
        };
      }
      case 'get_task':
        return enrichTask(await this.tasks.get(user, requiredUuid(args, 'id')));
      case 'create_task': {
        const schedule = taskSchedule(args);
        const recurrence = recurrenceFields(args, schedule.due_date ?? null, null);
        return enrichTask(
          (
            await this.tasks.create(
              user,
              {
                title: requiredString(args, 'title', 500),
                project_id: await this.projectId(user, args),
                ...schedule,
                ...recurrence,
              },
              undefined,
            )
          ).body,
        );
      }
      case 'complete_task': {
        const advance =
          args.advance === 'next_future' || args.advance === 'one_period'
            ? args.advance
            : 'one_period';
        const body = (
          await this.tasks.complete(
            user,
            requiredUuid(args, 'id'),
            {
              advance,
              materialize_next: args.materialize_next === true,
            },
            undefined,
          )
        ).body;
        return enrichTask(body);
      }
      case 'update_task': {
        const id = requiredUuid(args, 'id');
        const schedule = taskSchedule(args);
        const existing = await this.tasks.get(user, id);
        const dueForAnchor =
          schedule.due_date !== undefined
            ? schedule.due_date
            : (existing.due_date ?? null);
        const recurrence = recurrenceFields(args, dueForAnchor, existing.repeat_rule);
        return enrichTask(
          await this.tasks.update(user, id, {
            ...(typeof args.title === 'string' ? { title: requiredString(args, 'title', 500) } : {}),
            ...schedule,
            ...recurrence,
          }),
        );
      }
      case 'get_task_occurrences':
        return this.tasks.occurrences(
          user,
          requiredUuid(args, 'id'),
          requiredString(args, 'from', 40),
          requiredString(args, 'to', 40),
        );
      case 'detach_occurrence':
        return enrichTask(
          await this.tasks.detach(
            user,
            requiredUuid(args, 'id'),
            requiredString(args, 'due_date', 40),
            typeof args.title === 'string' ? requiredString(args, 'title', 500) : undefined,
          ),
        );
      case 'get_day_load':
        return this.closing.load(
          user,
          typeof args.date === 'string' ? args.date : (civilToday(user.timeZone) ?? ''),
          typeof args.time_zone === 'string' ? args.time_zone : user.timeZone,
        );
      case 'start_day_shutdown':
        return this.closing.startShutdown(
          user,
          typeof args.local_date === 'string' ? args.local_date : (civilToday(user.timeZone) ?? ''),
          typeof args.time_zone === 'string' ? args.time_zone : user.timeZone,
        );
      case 'record_shutdown_decision':
        return this.closing.decide(
          user,
          requiredUuid(args, 'session_id'),
          requiredUuid(args, 'task_id'),
          decisionOf(args),
          typeof args.target_date === 'string' ? args.target_date : null,
          args.evening === true,
        );
      case 'apply_day_shutdown':
        return this.closing.apply(
          user,
          requiredUuid(args, 'session_id'),
          revisionOf(args),
          requiredString(args, 'idempotency_key', 200),
        );
      case 'replan_day':
        return this.closing.replanTool(
          user,
          typeof args.date === 'string' ? args.date : undefined,
          args.auto_apply === true,
          decisionList(args),
          typeof args.idempotency_key === 'string' ? args.idempotency_key : undefined,
        );
      case 'list_projects':
        return this.lists.listProjects(user, limit, cursorOf(args), false);
      case 'create_project':
        return (
          await this.lists.createProject(
            user,
            { name: requiredString(args, 'name', 200) },
            undefined,
          )
        ).body;
      case 'list_tags':
        return this.tags.list(user, limit, cursorOf(args));
      case 'create_tag':
        return (
          await this.tags.create(user, { name: requiredString(args, 'name', 100) }, undefined)
        ).body;
      case 'list_filters':
        return this.filters.list(user, limit, cursorOf(args));
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
          cursorOf(args),
        );
      case 'list_habits':
        return this.habits.list(user, limit, cursorOf(args));
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
      case 'list_countdowns':
        return this.countdowns.list(
          user,
          args.archived === true,
          typeof args.due_within_days === 'number' ? args.due_within_days : undefined,
        );
      case 'get_countdown':
        return this.countdowns.get(user, requiredUuid(args, 'id'));
      case 'create_countdown':
        return (
          await this.countdowns.create(
            user,
            {
              title: requiredString(args, 'title', 200),
              target_date: requiredDate(args),
              ...(typeof args.type === 'string'
                ? { type: args.type as 'countdown' | 'anniversary' | 'birthday' | 'holiday' }
                : {}),
              ...(typeof args.emoji === 'string' ? { emoji: args.emoji } : {}),
              ...(typeof args.color === 'string' ? { color: args.color as never } : {}),
              ...(typeof args.repeat === 'string' ? { repeat_rule: args.repeat as never } : {}),
              ...(typeof args.day_mode === 'string' ? { day_mode: args.day_mode as never } : {}),
              ...(Array.isArray(args.reminders)
                ? {
                    reminders: args.reminders
                      .filter((v): v is number => typeof v === 'number')
                      .map((offset_days) => ({ offset_days })),
                  }
                : {}),
              ...(typeof args.notes === 'string' ? { notes: args.notes } : {}),
              ...(typeof args.show_in_sidebar === 'boolean'
                ? { show_in_sidebar: args.show_in_sidebar }
                : {}),
              ...(typeof args.show_in_smart_list === 'boolean'
                ? { show_in_smart_list: args.show_in_smart_list }
                : {}),
            },
            undefined,
          )
        ).body;
      case 'update_countdown':
        return this.countdowns.update(user, requiredUuid(args, 'id'), {
          ...(typeof args.title === 'string' ? { title: args.title } : {}),
          ...(typeof args.target_date === 'string' ? { target_date: args.target_date } : {}),
          ...(typeof args.pinned === 'boolean' ? { pinned: args.pinned } : {}),
        });
      case 'delete_countdown':
        await this.countdowns.remove(user, requiredUuid(args, 'id'));
        return { deleted: true };
      case 'archive_countdown':
        return this.countdowns.archive(user, requiredUuid(args, 'id'), true);
      case 'unarchive_countdown':
        return this.countdowns.archive(user, requiredUuid(args, 'id'), false);
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
      case 'list_external_calendars': {
        const subscriptions = await this.calendars.listSubscriptions(user);
        if (args.include_available !== true) {
          return subscriptions;
        }
        const available = await this.calendars.listGoogleCalendars(user);
        return { ...subscriptions, available };
      }
      case 'list_calendar_events': {
        const page = await this.calendars.range(
          user,
          requiredString(args, 'from', 40),
          requiredString(args, 'to', 40),
          typeof args.subscription_id === 'string' ? args.subscription_id : undefined,
        );
        if (args.include_external === false) {
          return { ...page, external: [] };
        }
        return page;
      }
      case 'add_external_calendar': {
        const provider = requiredString(args, 'provider', 16);
        if (provider === 'google') {
          return (
            await this.calendars.subscribeGoogle(
              user,
              {
                ...(typeof args.calendar_id === 'string' ? { calendar_id: args.calendar_id } : {}),
                ...(typeof args.color === 'string' ? { color: args.color } : {}),
              },
              undefined,
            )
          ).body;
        }
        return this.calendars.subscribe(user, {
          provider: 'ical',
          url: requiredString(args, 'url', 2000),
          ...(typeof args.color === 'string' ? { color: args.color } : {}),
        });
      }
      case 'sync_calendar':
        if (typeof args.subscription_id === 'string') {
          return this.calendars.refresh(user, requiredUuid(args, 'subscription_id'));
        }
        return this.calendars.syncAll(user);
      case 'update_external_calendar':
        return (
          await this.calendars.updateSubscription(
            user,
            requiredUuid(args, 'id'),
            {
              ...(typeof args.summary === 'string' ? { summary: args.summary } : {}),
              ...(typeof args.color === 'string' ? { color: args.color } : {}),
              ...(typeof args.visible === 'boolean' ? { visible: args.visible } : {}),
            },
            undefined,
          )
        ).body;
      case 'remove_external_calendar':
        await this.calendars.removeSubscription(user, requiredUuid(args, 'id'));
        return { deleted: true };
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

function exceptionMessage(error: DomainException): string {
  const response: unknown = error.getResponse();
  if (isRecord(response) && typeof response.message === 'string') {
    return response.message;
  }
  return error.message;
}

/** RF-2014: surface code and actionable message to the MCP client. */
function toolError(
  code: string,
  message?: string,
): { content: { type: 'text'; text: string }[]; isError: true } {
  const text =
    message !== undefined && message.length > 0 && message !== code
      ? `${code}: ${message}`
      : code;
  return { content: [{ type: 'text', text }], isError: true };
}

function enrichTask<T extends { repeat_rule?: string | null; time_zone?: string }>(
  task: T,
): T & { repeat_label?: string | null; next_occurrence?: string | null } {
  const rule = typeof task.repeat_rule === 'string' ? task.repeat_rule : null;
  if (rule === null || rule.length === 0) {
    return task;
  }
  const label = describeRepeatRule(rule);
  const parsed = parseRepeatRule(rule);
  const zone = typeof task.time_zone === 'string' ? task.time_zone : 'UTC';
  let next: string | null = null;
  if (parsed.ok) {
    next = firstAfter(parsed.rule, zone, new Date().toISOString());
  }
  return {
    ...task,
    repeat_label: label,
    next_occurrence: next,
  };
}

const WEEKDAYS: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/**
 * RF-2007 / RF-2008 / RF-2014. Maps structured `recurrence` or raw `repeat_rule`
 * into the TasksService DTO fields. Validates combinations before the service runs.
 */
function recurrenceFields(
  args: Record<string, unknown>,
  dueDate: string | null,
  existingRule: string | null,
): { repeat_rule?: string | null; repeat_from?: 'due_date' | 'completion_date' } {
  const hasRecurrence = Object.prototype.hasOwnProperty.call(args, 'recurrence');
  const hasRaw = Object.prototype.hasOwnProperty.call(args, 'repeat_rule');
  if (hasRecurrence && hasRaw) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'use either recurrence or repeat_rule, not both',
    );
  }

  const out: { repeat_rule?: string | null; repeat_from?: 'due_date' | 'completion_date' } = {};
  if (args.repeat_from === 'due_date' || args.repeat_from === 'completion_date') {
    out.repeat_from = args.repeat_from;
  }

  if (hasRaw) {
    if (args.repeat_rule === null) {
      out.repeat_rule = null;
      return out;
    }
    if (typeof args.repeat_rule !== 'string' || args.repeat_rule.trim().length === 0) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_rule',
        'repeat_rule must be an RRULE',
      );
    }
    if (dueDate === null && existingRule === null) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'missing_anchor',
        'a repeating task needs a due_date',
      );
    }
    out.repeat_rule = args.repeat_rule.trim();
    return out;
  }

  if (!hasRecurrence) {
    return out;
  }

  if (args.recurrence === null) {
    out.repeat_rule = null;
    return out;
  }

  if (!isRecord(args.recurrence)) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'recurrence must be an object',
    );
  }

  if (dueDate === null) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'missing_anchor',
      'a repeating task needs a due_date',
    );
  }

  const draft = draftFromRecurrence(args.recurrence);
  const built = buildRepeatRule(draft);
  if (!built.ok) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'invalid_rule',
      'repeat_rule must be an RRULE',
    );
  }
  out.repeat_rule = built.rule;
  return out;
}

function draftFromRecurrence(raw: Record<string, unknown>): RepeatDraft {
  const freq = raw.freq;
  if (freq !== 'daily' && freq !== 'weekly' && freq !== 'monthly' && freq !== 'yearly') {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'freq is required');
  }

  if (raw.weekdays !== undefined) {
    if (freq !== 'weekly') {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'weekdays only applies to weekly recurrence',
      );
    }
  }
  if (raw.month_day !== undefined || raw.month_week !== undefined) {
    if (freq !== 'monthly' && freq !== 'yearly') {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'month_day and month_week only apply to monthly or yearly recurrence',
      );
    }
  }
  if (raw.month_day !== undefined && raw.month_week !== undefined) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'use either month_day or month_week, not both',
    );
  }

  const weekdays =
    raw.weekdays === undefined
      ? undefined
      : (() => {
          if (!Array.isArray(raw.weekdays)) {
            throw new DomainException(
              HttpStatus.BAD_REQUEST,
              'validation_failed',
              'weekdays must be an array',
            );
          }
          return raw.weekdays.map((day) => {
            if (typeof day !== 'string' || !WEEKDAYS.includes(day as Weekday)) {
              throw new DomainException(
                HttpStatus.BAD_REQUEST,
                'validation_failed',
                'weekdays must be MO..SU',
              );
            }
            return day as Weekday;
          });
        })();

  const monthWeek =
    raw.month_week === undefined
      ? undefined
      : (() => {
          if (!isRecord(raw.month_week)) {
            throw new DomainException(
              HttpStatus.BAD_REQUEST,
              'validation_failed',
              'month_week is invalid',
            );
          }
          const setpos = raw.month_week.setpos;
          const weekday = raw.month_week.weekday;
          if (
            setpos !== 1 &&
            setpos !== 2 &&
            setpos !== 3 &&
            setpos !== 4 &&
            setpos !== -1
          ) {
            throw new DomainException(
              HttpStatus.BAD_REQUEST,
              'validation_failed',
              'month_week.setpos is invalid',
            );
          }
          if (typeof weekday !== 'string' || !WEEKDAYS.includes(weekday as Weekday)) {
            throw new DomainException(
              HttpStatus.BAD_REQUEST,
              'validation_failed',
              'month_week.weekday is invalid',
            );
          }
          return {
            setpos: setpos as 1 | 2 | 3 | 4 | -1,
            weekday: weekday as Weekday,
          };
        })();

  const draft: RepeatDraft = { freq };
  return {
    ...draft,
    ...(typeof raw.interval === 'number' ? { interval: raw.interval } : {}),
    ...(weekdays === undefined ? {} : { weekdays }),
    ...(typeof raw.month_day === 'number' ? { monthDay: raw.month_day } : {}),
    ...(monthWeek === undefined ? {} : { monthWeek }),
    ...(typeof raw.until === 'string' ? { until: `${raw.until}T23:59:59.000Z` } : {}),
    ...(typeof raw.count === 'number' ? { count: raw.count } : {}),
  };
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

const DECISIONS = ['done', 'plan_day', 'later', 'someday', 'cancel', 'trash', 'skip'] as const;

function taskSchedule(args: Record<string, unknown>): {
  due_date?: string | null;
  start_date?: string | null;
  is_all_day?: boolean;
  duration_minutes?: number | null;
  priority?: 'none' | 'low' | 'medium' | 'high';
  someday?: boolean;
  evening_only?: boolean;
} {
  return {
    ...(args.due_date === null || typeof args.due_date === 'string'
      ? { due_date: args.due_date }
      : {}),
    ...(args.start_date === null || typeof args.start_date === 'string'
      ? { start_date: args.start_date }
      : {}),
    ...(typeof args.is_all_day === 'boolean' ? { is_all_day: args.is_all_day } : {}),
    ...(args.duration_minutes === null || typeof args.duration_minutes === 'number'
      ? { duration_minutes: args.duration_minutes }
      : {}),
    ...(args.priority === 'none' ||
    args.priority === 'low' ||
    args.priority === 'medium' ||
    args.priority === 'high'
      ? { priority: args.priority }
      : {}),
    ...(typeof args.someday === 'boolean' ? { someday: args.someday } : {}),
    ...(typeof args.evening_only === 'boolean' ? { evening_only: args.evening_only } : {}),
  };
}

function decisionOf(args: Record<string, unknown>): PlanDecisionKind {
  const found = DECISIONS.find((item) => item === args.decision);
  if (found === undefined) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'decision is invalid');
  }
  return found;
}

function revisionOf(args: Record<string, unknown>): number {
  if (typeof args.expected_revision !== 'number' || !Number.isInteger(args.expected_revision)) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'expected_revision is invalid',
    );
  }
  return args.expected_revision;
}

function decisionList(args: Record<string, unknown>): {
  task_id: string;
  decision: PlanDecisionKind;
  target_date?: string | null;
}[] {
  if (args.decisions === undefined) {
    return [];
  }
  if (!Array.isArray(args.decisions)) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'decisions must be a list',
    );
  }
  return args.decisions.map((item) => {
    if (!isRecord(item)) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'decision is invalid');
    }
    return {
      task_id: requiredUuid(item, 'task_id'),
      decision: decisionOf(item),
      ...(typeof item.target_date === 'string' ? { target_date: item.target_date } : {}),
    };
  });
}

function civilToday(timeZone: string): string | null {
  return civilDateKey(new Date().toISOString(), timeZone);
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

function cursorOf(args: Record<string, unknown>): string | undefined {
  if (args.cursor === undefined) {
    return undefined;
  }
  if (typeof args.cursor !== 'string' || args.cursor.length === 0) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'cursor is invalid');
  }
  return args.cursor;
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
