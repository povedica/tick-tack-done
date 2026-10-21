import { listOverdueTaskIds } from '../../reading/overdue.js';
import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type Task } from '@prisma/client';
import {
  acceptsColumnDrop,
  allDayClockConflict,
  canonicalizeRepeatRule,
  decideParentCompletion,
  deriveDurationMinutes,
  excludeOccurrence,
  extractMarkdownChecklist,
  isRasterImage,
  isIanaTimeZone,
  nextOccurrence,
  normalizeTaskTitle,
  occurrencesBetween,
  parseTaskInstant,
  resolveSubtaskProject,
  parseTrigger,
  reminderFireAt,
  listVisible,
  projectConstraint,
  resolveDefaultReminder,
  snoozeDue,
  snoozeReminder,
  sortOrderAtEnd,
  tagDescendantIds,
  type CompleteChildrenChoice,
  type DateSnoozePreset,
  type Priority,
  type ReminderSnoozePreset,
} from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { hashInboundToken, inboundLocalPart } from '../../inbound/email-address.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { DomainException } from '../../http/domain.exception.js';
import { asJson } from '../../http/json.js';
import { readClocks, selectPatch, stampTerminal } from './field-clocks.js';
import { taskEventSnapshot } from './task-event-snapshot.js';
import { normalizeIdempotencyKey, requestFingerprint } from '../../idempotency/fingerprint.js';
import { IdempotencyService } from '../../idempotency/idempotency.service.js';
import { placementPlan } from '../../ordering/placement.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Tx } from '../../prisma/tx.js';
import {
  assertInboundFiles,
  optionalToken,
  safeMime,
  untrustedText,
  type InboundFile,
} from './inbound-mail.js';
import { resolveQuickAdd, type CaptureWarning } from './quick-add.js';
import {
  acceptedMime,
  ATTACHMENT_MAX_PER_TASK,
  ATTACHMENT_USER_QUOTA_BYTES,
  removeAttachmentFile,
  resolveAttachment,
  safeFileName,
  writeAttachment,
} from './attachment-storage.js';
import { encodeTaskCursor, taskKeyset, taskOrderBy, type TaskSort } from './task-cursor.js';
import {
  progressOf,
  toChecklistJson,
  toTaskSummary,
  type ChecklistItemJson,
  type TaskSummaryJson,
} from './task.mapper.js';
import type {
  BatchTasksDto,
  CreateReminderDto,
  ChecklistItemDto,
  CompleteTaskDto,
  CreateTaskDto,
  MoveTaskDto,
  UpdateChecklistItemDto,
  UpdateTaskDto,
} from './tasks.dto.js';

const taskInclude = {
  tags: { where: { tag: { deletedAt: null } }, select: { tagId: true } },
  checklist: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.TaskInclude;

type TaskWithBits = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export interface CreatedTask extends TaskDetail {
  readonly warnings?: readonly CaptureWarning[];
}

/** RF-2012. Optional series payload returned by complete (and MCP). */
export interface CompletedTask extends CreatedTask {
  readonly series?: {
    readonly materialized: boolean;
    readonly next_due_date: string | null;
    readonly eta_seconds: number | null;
  };
}

export interface TaskDetail extends TaskSummaryJson {
  items: ChecklistItemJson[];
  subtasks: TaskSummaryJson[];
  activity: {
    id: string;
    action: string;
    changes: Prisma.JsonValue;
    created_at: string;
    actor_id: string;
  }[];
}

export interface TaskListQuery {
  limit: number;
  cursor?: string;
  projectId?: string;
  status: 'active' | 'completed' | 'archived' | 'cancelled' | 'all';
  priority?: Priority;
  tagId?: string;
  includeDescendants: boolean;
  dueBefore?: string;
  dueAfter?: string;
  q?: string;
  flat: boolean;
  sort: TaskSort;
  deleted: boolean;
  overdue: boolean;
  someday?: boolean;
}

/** A subtask in another list stays visible in its own list. Same-list children stay nested. */
function visibleParents(query: TaskListQuery): Prisma.TaskWhereInput {
  if (query.deleted || query.flat) {
    return {};
  }
  if (query.projectId === undefined) {
    return { parentId: null };
  }
  return {
    OR: [{ parentId: null }, { parent: { projectId: { not: query.projectId } } }],
  };
}

interface Saved {
  statusCode: number;
  body: CreatedTask;
  replayed: boolean;
}

@Injectable()
export class TasksService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  async list(
    user: AuthUser,
    query: TaskListQuery,
  ): Promise<{ items: TaskSummaryJson[]; next_cursor: string | null }> {
    const searchIds = query.q === undefined ? null : await this.searchIds(user.id, query.q);
    const overdueIds = query.overdue ? await this.overdueIds(user.id) : null;
    const limitedIds = intersectIds(searchIds, overdueIds);
    if (limitedIds !== null && limitedIds.length === 0) {
      return { items: [], next_cursor: null };
    }
    const tagIds =
      query.tagId === undefined
        ? null
        : await this.tagScope(user.id, query.tagId, query.includeDescendants);
    const listFilter = projectConstraint(user.listIds, query.projectId);
    if (listFilter.id !== undefined) {
      return { items: [], next_cursor: null };
    }
    const rows = await this.prisma.task.findMany({
      where: {
        ownerId: user.id,
        ...(query.deleted ? { deletedAt: { not: null } } : { deletedAt: null }),
        ...visibleParents(query),
        ...(listFilter.projectId === undefined ? {} : { projectId: listFilter.projectId }),
        ...(query.deleted || query.status === 'all' ? {} : { status: query.status }),
        ...(query.priority === undefined ? {} : { priority: query.priority }),
        ...(tagIds === null ? {} : { tags: { some: { tagId: { in: tagIds } } } }),
        ...(query.dueBefore === undefined && query.dueAfter === undefined
          ? {}
          : {
              dueDate: {
                ...(query.dueBefore === undefined
                  ? {}
                  : { lt: this.instant(query.dueBefore, 'due_before', 'UTC').date }),
                ...(query.dueAfter === undefined
                  ? {}
                  : { gt: this.instant(query.dueAfter, 'due_after', 'UTC').date }),
              },
            }),
        isSomeday: query.someday === true,
        ...(limitedIds === null ? {} : { id: { in: limitedIds } }),
        ...(taskKeyset(query.sort, query.cursor) ?? {}),
      },
      include: { tags: { where: { tag: { deletedAt: null } }, select: { tagId: true } } },
      orderBy: taskOrderBy(query.sort),
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const progress = await this.progressMap(page.map((row) => row.id));
    const last = page.at(-1);
    return {
      items: page.map((row) =>
        toTaskSummary(row, progress.get(row.id) ?? { completed: 0, total: 0 }),
      ),
      next_cursor: hasMore && last !== undefined ? encodeTaskCursor(query.sort, last) : null,
    };
  }

  async acceptInboundEmail(input: {
    readonly recipient: unknown;
    readonly subject: unknown;
    readonly text: unknown;
    readonly messageId: unknown;
    readonly files: readonly InboundFile[];
  }): Promise<CreatedTask> {
    const local = typeof input.recipient === 'string' ? inboundLocalPart(input.recipient) : null;
    if (local === null) {
      throw new DomainException(HttpStatus.UNAUTHORIZED, 'unauthorized', 'Invalid recipient');
    }
    const owner = await this.prisma.user.findFirst({
      where: { inboundEmailTokenHash: hashInboundToken(local), deletedAt: null },
      select: { id: true, email: true, timeZone: true, taskCompleteChildren: true },
    });
    if (owner === null) {
      throw new DomainException(HttpStatus.UNAUTHORIZED, 'unauthorized', 'Invalid recipient');
    }
    const subject = untrustedText(input.subject, 2_000, 'subject', true);
    const text = untrustedText(input.text, 100_000, 'text', false);
    const messageId = optionalToken(input.messageId);
    if (subject.trim().length === 0) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'empty_title', 'title is required');
    }
    assertInboundFiles(input.files);
    const user: AuthUser = {
      id: owner.id,
      email: owner.email,
      timeZone: owner.timeZone,
      completeChildren: owner.taskCompleteChildren,
      scopes: ['tasks:write'],
      tokenId: null,
      sessionId: null,
      listIds: null,
    };
    const metadata: Record<string, unknown> = { capture: 'email' };
    if (messageId !== null) {
      metadata.inbound_message_id = messageId;
    }
    const created = await this.prisma.$transaction(async (tx) => {
      if (messageId !== null) {
        const existing = await tx.task.findFirst({
          where: {
            ownerId: user.id,
            deletedAt: null,
            metadata: { path: ['inbound_message_id'], equals: messageId },
          },
          select: { id: true },
        });
        if (existing !== null) {
          return { task: await this.load(tx, user, existing.id, false), fresh: false };
        }
      }
      return {
        task: await this.insertTask(
          tx,
          user,
          { raw_text: subject, content: text, metadata },
          'api',
        ),
        fresh: true,
      };
    });
    if (created.fresh) {
      for (const file of input.files) {
        await this.addAttachment(user, created.task.id, {
          originalname: file.originalname,
          mimetype: safeMime(file.mimetype),
          size: file.buffer.length,
          buffer: file.buffer,
        });
      }
    }
    return created.task;
  }

  create(user: AuthUser, dto: CreateTaskDto, keyRaw: string | undefined): Promise<Saved> {
    if (
      dto.reminder_trigger !== undefined &&
      dto.reminder_trigger !== null &&
      !parseTrigger(dto.reminder_trigger).ok
    ) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_reminder',
        'Reminder trigger is invalid',
      );
    }
    const key = normalizeIdempotencyKey(keyRaw);
    return this.idempotency.run({
      ownerId: user.id,
      key,
      fingerprint: requestFingerprint('POST', '/api/v1/tasks', dto),
      statusCode: 201,
      execute: (tx) => this.insertTask(tx, user, dto),
    });
  }

  get(user: AuthUser, id: string): Promise<TaskDetail> {
    return this.load(this.prisma, user, id, false);
  }

  async update(user: AuthUser, id: string, dto: UpdateTaskDto): Promise<TaskDetail> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.require(tx, user.id, id, false);
      const receivedAt = new Date().toISOString();
      const selected = selectPatch(dto, readClocks(current.fieldClocks), receivedAt);
      if (selected === null) {
        throw new DomainException(
          HttpStatus.BAD_REQUEST,
          'validation_failed',
          'field_clocks must be ISO-8601',
        );
      }
      if (selected.skipped.length > 0) {
        await tx.activityLog.create({
          data: {
            ownerId: user.id,
            actorId: user.id,
            tokenId: user.tokenId,
            entityType: 'task',
            entityId: id,
            action: 'updated',
            changes: { conflict: true, skipped: [...selected.skipped], rule: 'last_write_wins' },
          },
        });
      }
      const structural =
        dto.before_id !== undefined || dto.move_to_end === true || dto.extract_checklist === true;
      if (!selected.changed && !structural) {
        return this.load(tx, user, id, false);
      }
      dto = selected.dto;
      const previous = await this.load(tx, user, id, false);
      const title = dto.title === undefined ? current.title : this.title(dto.title);
      const timeZone = dto.time_zone === undefined ? current.timeZone : this.zone(dto.time_zone);
      const someday = dto.someday ?? current.isSomeday;
      const startParsed = someday
        ? { date: null as Date | null, dateOnly: false }
        : this.nextDate(current.startDate, dto.start_date, 'start_date', timeZone);
      const dueParsed = this.nextDate(current.dueDate, dto.due_date, 'due_date', timeZone);
      const start = startParsed.date;
      const due = dueParsed.date;
      const inferredAllDay =
        (dto.start_date !== undefined && startParsed.dateOnly) ||
        (dto.due_date !== undefined && dueParsed.dateOnly);
      const isAllDay =
        dto.is_all_day ?? (inferredAllDay ? true : current.isAllDay);
      this.assertTimed(due, isAllDay, timeZone);
      this.assertTimed(start, isAllDay, timeZone);
      const duration = this.duration(
        start,
        due,
        dto.duration_minutes === undefined ? current.durationMinutes : dto.duration_minutes,
      );
      let content = dto.content ?? current.content;
      const extracted = dto.extract_checklist === true ? extractMarkdownChecklist(content) : null;
      if (extracted !== null) {
        content = extracted.content;
      }
      if (dto.column_id !== undefined && dto.column_id !== null) {
        const column = await this.requireColumn(tx, user.id, current.projectId, dto.column_id);
        await this.assertWip(tx, user.id, column, id);
      }
      if (dto.tag_ids !== undefined) {
        await this.requireTags(tx, user.id, dto.tag_ids);
      }
      const repeatRule =
        dto.repeat_rule === undefined
          ? current.repeatRule
          : this.canonicalRule(dto.repeat_rule, due, timeZone);
      const seriesId = repeatRule === null ? null : (current.seriesId ?? current.id);
      const reorder = dto.before_id !== undefined || dto.move_to_end === true;
      const plan = reorder
        ? await this.planTaskSort(
            tx,
            user.id,
            current.projectId,
            current.parentId,
            id,
            dto.before_id,
            dto.move_to_end,
          )
        : null;
      const row = await tx.task.update({
        where: { id },
        data: {
          title,
          content,
          timeZone,
          startDate: start,
          dueDate: due,
          durationMinutes: duration,
          isSomeday: someday,
          ...(dto.evening_only !== undefined ? { eveningOnly: dto.evening_only } : {}),
          ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.is_all_day !== undefined ? { isAllDay } : {}),
          ...(dto.column_id !== undefined ? { columnId: dto.column_id } : {}),
          ...(dto.repeat_from !== undefined ? { repeatFrom: dto.repeat_from } : {}),
          ...(repeatRule !== current.repeatRule
            ? { repeatRule, seriesId, recurrenceOpen: repeatRule !== null }
            : {}),
          ...(dto.metadata !== undefined ? { metadata: asJson(dto.metadata) } : {}),
          ...(plan !== null ? { sortOrder: plan } : {}),
          ...(selected.changed ? { fieldClocks: asJson(selected.clocks) } : {}),
        },
      });
      if (dto.tag_ids !== undefined) {
        await tx.taskTag.deleteMany({ where: { taskId: id } });
        await this.linkTags(tx, id, dto.tag_ids);
      }
      if (extracted !== null) {
        await this.materializeExtract(
          tx,
          user,
          row,
          extracted.items,
          dto.extract_as ?? 'checklist',
        );
      }
      if (current.dueDate === null && due !== null) {
        await this.ensureDefaultReminder(tx, user.id, current.projectId, id, due, row.kind, null);
      }
      const dueChanged = (current.dueDate?.getTime() ?? null) !== (due?.getTime() ?? null);
      if (dueChanged) {
        await this.cancelDeliveries(tx, [id]);
      }
      const detail = await this.load(tx, user, id, false);
      await this.events.record(tx, actorOf(user), {
        type: this.updateEvent(previous.kind, detail.kind),
        entityType: detail.kind === 'note' ? 'note' : 'task',
        entityId: id,
        action: 'updated',
        data: { task: asJson(taskEventSnapshot(detail)) },
        previous: asJson(taskEventSnapshot(previous)),
      });
      return this.load(tx, user, id, false);
    });
  }

  async cancel(user: AuthUser, id: string): Promise<TaskDetail> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.require(tx, user.id, id, false);
      if (current.status === 'cancelled') {
        return this.load(tx, user, id, false);
      }
      const children = await tx.task.findMany({
        where: { parentId: id, ownerId: user.id, status: 'active', deletedAt: null },
        select: { id: true },
      });
      const ids = [id, ...children.map((child) => child.id)];
      await this.cancelDeliveries(tx, ids);
      await tx.task.updateMany({
        where: { id: { in: ids } },
        data: { status: 'cancelled' },
      });
      for (const child of children) {
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.taskCancelled,
          entityType: 'task',
          entityId: child.id,
          action: 'updated',
          data: { task: { id: child.id, status: 'cancelled', parent_id: id } },
          previous: { status: 'active' },
        });
      }
      const detail = await this.load(tx, user, id, false);
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.taskCancelled,
        entityType: 'task',
        entityId: id,
        action: 'updated',
        data: { task: asJson(taskEventSnapshot(detail)) },
        previous: { status: current.status },
      });
      return detail;
    });
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.require(tx, user.id, id, false);
      const now = new Date();
      const existing = await this.require(tx, user.id, id, false);
      const removed = await tx.task.findMany({
        where: { ownerId: user.id, OR: [{ id }, { parentId: id }], deletedAt: null },
        select: { id: true },
      });
      await this.cancelDeliveries(
        tx,
        removed.map((item) => item.id),
      );
      await tx.task.updateMany({
        where: { ownerId: user.id, OR: [{ id }, { parentId: id }], deletedAt: null },
        data: { deletedAt: now },
      });
      await tx.task.update({
        where: { id },
        data: {
          fieldClocks: asJson(
            stampTerminal(readClocks(existing.fieldClocks), now.toISOString(), 'delete'),
          ),
        },
      });
      const detail = await this.load(tx, user, id, true);
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.taskDeleted,
        entityType: 'task',
        entityId: id,
        action: 'deleted',
        data: { task: asJson(taskEventSnapshot(detail)) },
        previous: null,
      });
    });
  }

  complete(
    user: AuthUser,
    id: string,
    dto: CompleteTaskDto,
    keyRaw: string | undefined,
  ): Promise<Saved> {
    const key = normalizeIdempotencyKey(keyRaw);
    return this.idempotency.run({
      ownerId: user.id,
      key,
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${id}/complete`, dto),
      statusCode: 200,
      execute: (tx) =>
        this.completeIn(tx, user, id, dto.complete_children ?? null, {
          advance: dto.advance ?? 'one_period',
          materializeNext: dto.materialize_next === true,
        }),
    });
  }

  async uncomplete(user: AuthUser, id: string): Promise<TaskDetail> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.require(tx, user.id, id, false);
      if (current.status !== 'completed') {
        return this.load(tx, user, id, false);
      }
      if (current.seriesId !== null) {
        const successor = await tx.task.findFirst({
          where: {
            seriesId: current.seriesId,
            status: 'active',
            deletedAt: null,
            ownerId: user.id,
          },
          select: { id: true },
        });
        if (successor !== null) {
          throw new DomainException(
            HttpStatus.CONFLICT,
            'series_already_advanced',
            'The next occurrence is already active',
          );
        }
      }
      await tx.task.update({
        where: { id },
        data: { status: 'active', completedAt: null, recurrenceOpen: current.repeatRule !== null },
      });
      const detail = await this.load(tx, user, id, false);
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.taskUncompleted,
        entityType: 'task',
        entityId: id,
        action: 'updated',
        data: { task: asJson(taskEventSnapshot(detail)) },
        previous: { status: 'completed' },
      });
      return detail;
    });
  }

  async snooze(
    user: AuthUser,
    id: string,
    preset: DateSnoozePreset,
    date: string | null,
  ): Promise<TaskDetail> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.require(tx, user.id, id, false);
      const moved = snoozeDue({
        dueDate: current.dueDate === null ? null : current.dueDate.toISOString(),
        startDate: current.startDate === null ? null : current.startDate.toISOString(),
        isAllDay: current.isAllDay,
        timeZone: current.timeZone,
        now: new Date().toISOString(),
        preset,
        ...(date === null ? {} : { date }),
      });
      if (!moved.ok) {
        throw new DomainException(
          HttpStatus.BAD_REQUEST,
          'validation_failed',
          moved.reason === 'date_required' ? 'date is required' : 'date is invalid',
        );
      }
      const start = moved.dates.startDate === null ? null : new Date(moved.dates.startDate);
      const due = new Date(moved.dates.dueDate);
      await tx.task.update({
        where: { id },
        data: {
          startDate: start,
          dueDate: due,
          durationMinutes: this.duration(start, due, current.durationMinutes),
        },
      });
      const detail = await this.load(tx, user, id, false);
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.taskUpdated,
        entityType: 'task',
        entityId: id,
        action: 'updated',
        data: { task: asJson(taskEventSnapshot(detail)), snoozed_to: preset },
        previous: { due_date: current.dueDate?.toISOString() ?? null },
      });
      return detail;
    });
  }

  async occurrences(
    user: AuthUser,
    id: string,
    from: string | undefined,
    to: string | undefined,
  ): Promise<{ occurrences: { due_date: string; start_date: string | null }[] }> {
    const current = await this.require(this.prisma, user.id, id, false);
    if (from === undefined || to === undefined) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'from and to are required',
      );
    }
    if (current.repeatRule === null) {
      return { occurrences: [] };
    }
    const listed = occurrencesBetween({
      repeatRule: current.repeatRule,
      dueDate: current.dueDate === null ? null : current.dueDate.toISOString(),
      startDate: current.startDate === null ? null : current.startDate.toISOString(),
      timeZone: current.timeZone,
      from,
      to,
    });
    if (!listed.ok) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', listed.reason);
    }
    return {
      occurrences: listed.occurrences.map((item) => ({
        due_date: item.dueDate,
        start_date: item.startDate,
      })),
    };
  }

  async detach(
    user: AuthUser,
    id: string,
    dueDate: string,
    title: string | undefined,
  ): Promise<TaskDetail> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.require(tx, user.id, id, false);
      if (current.repeatRule === null || current.seriesId === null) {
        throw new DomainException(
          HttpStatus.CONFLICT,
          'not_recurring',
          'The task is not repeating',
        );
      }
      const excluded = excludeOccurrence(current.repeatRule, dueDate);
      if (!excluded.ok) {
        throw new DomainException(
          HttpStatus.BAD_REQUEST,
          'validation_failed',
          'due_date is invalid',
        );
      }
      const target = this.instant(dueDate, 'due_date', current.timeZone).date;
      const currentDue = current.dueDate?.getTime() ?? Number.NaN;
      const detachesCurrent = Math.abs(currentDue - target.getTime()) < 1000;
      if (detachesCurrent) {
        await tx.task.update({
          where: { id },
          data: {
            repeatRule: null,
            seriesId: null,
            recurrenceOpen: false,
            ...(title === undefined ? {} : { title: this.title(title) }),
          },
        });
        await tx.seriesAdvance.create({
          data: {
            ownerId: user.id,
            seriesId: current.seriesId,
            sourceTaskId: id,
            repeatRule: excluded.rule,
            repeatFrom: current.repeatFrom,
            timeZone: current.timeZone,
            isAllDay: current.isAllDay,
            dueDate: current.dueDate,
            startDate: current.startDate,
          },
        });
        const detail = await this.load(tx, user, id, false);
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.taskUpdated,
          entityType: 'task',
          entityId: id,
          action: 'updated',
          data: { task: asJson(taskEventSnapshot(detail)), detached: true },
          previous: { repeat_rule: current.repeatRule },
        });
        return detail;
      }
      await tx.task.update({ where: { id }, data: { repeatRule: excluded.rule } });
      const copyId = randomUUID();
      await tx.task.create({
        data: {
          id: copyId,
          ownerId: user.id,
          projectId: current.projectId,
          parentId: current.parentId,
          columnId: current.columnId,
          title: title === undefined ? current.title : this.title(title),
          content: current.content,
          kind: current.kind,
          priority: current.priority,
          isAllDay: current.isAllDay,
          startDate: current.startDate,
          dueDate: target,
          timeZone: current.timeZone,
          durationMinutes: current.durationMinutes,
          repeatRule: null,
          repeatFrom: current.repeatFrom,
          seriesId: null,
          recurrenceOpen: false,
          sortOrder: current.sortOrder,
          createdById: user.id,
          source: 'manual',
        },
      });
      await tx.taskTag.createMany({
        data: (await tx.taskTag.findMany({ where: { taskId: id }, select: { tagId: true } })).map(
          (tag) => ({ taskId: copyId, tagId: tag.tagId }),
        ),
      });
      const created = await this.load(tx, user, copyId, false);
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.taskUpdated,
        entityType: 'task',
        entityId: id,
        action: 'updated',
        data: { task: { id, repeat_rule: excluded.rule }, detached_due: dueDate },
        previous: { repeat_rule: current.repeatRule },
      });
      await this.events.record(tx, actorOf(user), {
        type: created.kind === 'note' ? DomainEvent.noteCreated : DomainEvent.taskCreated,
        entityType: created.kind === 'note' ? 'note' : 'task',
        entityId: copyId,
        action: 'created',
        data: { task: asJson(taskEventSnapshot(created)), detached_from: id },
        previous: null,
      });
      return created;
    });
  }

  async move(user: AuthUser, id: string, dto: MoveTaskDto): Promise<TaskDetail> {
    return this.prisma.$transaction((tx) => this.moveIn(tx, user, id, dto));
  }

  private async moveIn(tx: Tx, user: AuthUser, id: string, dto: MoveTaskDto): Promise<TaskDetail> {
    {
      const current = await this.require(tx, user.id, id, false);
      const project = await this.requireProject(tx, user.id, dto.project_id);
      if (current.parentId !== null) {
        const parent = await this.require(tx, user.id, current.parentId, false);
        const resolved = resolveSubtaskProject({
          requestedProjectId: project.id,
          parentProjectId: parent.projectId,
        });
        if (resolved.projectId !== project.id) {
          await this.requireProject(tx, user.id, resolved.projectId);
        }
      }
      if (dto.column_id !== undefined && dto.column_id !== null) {
        const column = await this.requireColumn(tx, user.id, project.id, dto.column_id);
        await this.assertWip(tx, user.id, column, current.id);
      }
      const sortOrder = await this.planTaskSort(
        tx,
        user.id,
        project.id,
        current.parentId,
        id,
        dto.before_task_id,
        dto.before_task_id === undefined,
      );
      await tx.task.update({
        where: { id },
        data: {
          projectId: project.id,
          columnId:
            dto.column_id === undefined
              ? project.id === current.projectId
                ? current.columnId
                : null
              : dto.column_id,
          sortOrder,
        },
      });
      if (project.id !== current.projectId) {
        await tx.task.updateMany({
          where: { ownerId: user.id, parentId: id },
          data: { projectId: project.id, columnId: null },
        });
      }
      const detail = await this.load(tx, user, id, false);
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.taskMoved,
        entityType: 'task',
        entityId: id,
        action: 'updated',
        data: { task: asJson(taskEventSnapshot(detail)) },
        previous: { project_id: current.projectId, column_id: current.columnId },
      });
      return detail;
    }
  }

  duplicate(user: AuthUser, id: string, keyRaw: string | undefined): Promise<Saved> {
    const key = normalizeIdempotencyKey(keyRaw);
    return this.idempotency.run({
      ownerId: user.id,
      key,
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${id}/duplicate`, {}),
      statusCode: 201,
      execute: async (tx) => {
        const source = await tx.task.findFirst({
          where: { id, ownerId: user.id, deletedAt: null },
          include: taskInclude,
        });
        if (source === null) {
          throw new DomainException(HttpStatus.NOT_FOUND, 'task_not_found', 'Task was not found');
        }
        const copyId = await this.copyTask(tx, user, source, source.projectId, null);
        return this.load(tx, user, copyId, false);
      },
    });
  }

  async batch(user: AuthUser, dto: BatchTasksDto): Promise<{ updated: number }> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.task.findMany({
        where: { ownerId: user.id, id: { in: dto.ids }, deletedAt: null },
        select: { id: true },
      });
      if (rows.length !== new Set(dto.ids).size) {
        throw new DomainException(
          HttpStatus.NOT_FOUND,
          'task_not_found',
          'One or more tasks were not found',
        );
      }
      if (dto.action === 'complete') {
        for (const id of dto.ids) {
          await this.completeIn(tx, user, id, dto.complete_children ?? null, {
            advance: 'one_period',
            materializeNext: false,
          });
        }
      } else if (dto.action === 'move') {
        if (dto.project_id === undefined) {
          throw new DomainException(
            HttpStatus.BAD_REQUEST,
            'validation_failed',
            'project_id is required',
          );
        }
        for (const id of dto.ids) {
          await this.moveIn(tx, user, id, {
            project_id: dto.project_id,
            ...(dto.column_id !== undefined ? { column_id: dto.column_id } : {}),
          });
        }
      } else if (dto.action === 'tag') {
        const tagIds = dto.tag_ids ?? [];
        await this.requireTags(tx, user.id, tagIds);
        await tx.taskTag.createMany({
          data: dto.ids.flatMap((taskId) => tagIds.map((tagId) => ({ taskId, tagId }))),
          skipDuplicates: true,
        });
        for (const id of dto.ids) {
          await this.emitUpdated(tx, user, id);
        }
      } else if (dto.action === 'priority') {
        if (dto.priority === undefined) {
          throw new DomainException(
            HttpStatus.BAD_REQUEST,
            'validation_failed',
            'priority is required',
          );
        }
        await tx.task.updateMany({
          where: { ownerId: user.id, id: { in: dto.ids } },
          data: { priority: dto.priority },
        });
        for (const id of dto.ids) {
          await this.emitUpdated(tx, user, id);
        }
      } else if (dto.action === 'due') {
        const due =
          dto.due_date === undefined
            ? null
            : this.nextDate(null, dto.due_date, 'due_date', user.timeZone).date;
        await tx.task.updateMany({
          where: { ownerId: user.id, id: { in: dto.ids } },
          data: { dueDate: due },
        });
        for (const id of dto.ids) {
          await this.emitUpdated(tx, user, id);
        }
      } else {
        const now = new Date();
        await tx.task.updateMany({
          where: { ownerId: user.id, id: { in: dto.ids } },
          data: { deletedAt: now },
        });
        for (const id of dto.ids) {
          await this.events.record(tx, actorOf(user), {
            type: DomainEvent.taskDeleted,
            entityType: 'task',
            entityId: id,
            action: 'deleted',
            data: { task: { id, deleted_at: now.toISOString() } },
            previous: null,
          });
        }
      }
      return { updated: dto.ids.length };
    });
  }

  async restore(user: AuthUser, id: string): Promise<TaskDetail> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.task.findFirst({ where: { id, ownerId: user.id } });
      if (current === null) {
        throw new DomainException(
          HttpStatus.NOT_FOUND,
          'task_not_found',
          'Trashed task was not found',
        );
      }
      if (current.deletedAt === null) {
        throw new DomainException(
          HttpStatus.NOT_FOUND,
          'task_not_found',
          'Trashed task was not found',
        );
      }
      const project = await tx.project.findFirst({
        where: { id: current.projectId, ownerId: user.id, deletedAt: null },
      });
      if (project === null) {
        throw new DomainException(
          HttpStatus.CONFLICT,
          'project_in_trash',
          'Restore the list before the task',
        );
      }
      let parentId = current.parentId;
      if (parentId !== null) {
        const parent = await tx.task.findFirst({
          where: { id: parentId, ownerId: user.id, deletedAt: null },
        });
        if (parent === null) {
          parentId = null;
        }
      }
      await tx.task.update({ where: { id }, data: { deletedAt: null, parentId } });
      const detail = await this.load(tx, user, id, false);
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.taskRestored,
        entityType: 'task',
        entityId: id,
        action: 'updated',
        data: { task: asJson(taskEventSnapshot(detail)) },
        previous: { deleted_at: current.deletedAt.toISOString() },
      });
      return detail;
    });
  }

  async purge(user: AuthUser, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.task.findFirst({ where: { id, ownerId: user.id } });
      if (current?.deletedAt == null) {
        throw new DomainException(
          HttpStatus.NOT_FOUND,
          'task_not_found',
          'Trashed task was not found',
        );
      }
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.taskDeleted,
        entityType: 'task',
        entityId: id,
        action: 'deleted',
        data: { task: { id, purged: true } },
        previous: { deleted_at: current.deletedAt.toISOString() },
      });
      await tx.task.delete({ where: { id } });
    });
  }

  async emptyTrash(user: AuthUser): Promise<{ deleted: number }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: { ownerId: user.id, deletedAt: { not: null } },
        data: { parentId: null },
      });
      const result = await tx.task.deleteMany({
        where: { ownerId: user.id, deletedAt: { not: null } },
      });
      return { deleted: result.count };
    });
  }

  createItem(
    user: AuthUser,
    taskId: string,
    dto: ChecklistItemDto,
    keyRaw: string | undefined,
  ): Promise<{ statusCode: number; body: ChecklistItemJson; replayed: boolean }> {
    const key = normalizeIdempotencyKey(keyRaw);
    return this.idempotency.run({
      ownerId: user.id,
      key,
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${taskId}/items`, dto),
      statusCode: 201,
      execute: async (tx) => {
        await this.require(tx, user.id, taskId, false);
        const rows = await tx.checklistItem.findMany({
          where: { ownerId: user.id, taskId, deletedAt: null },
          select: { id: true, sortOrder: true },
        });
        const plan = placementPlan(rows, null, dto.before_id, dto.move_to_end);
        for (const update of plan.updates) {
          await tx.checklistItem.update({
            where: { id: update.id },
            data: { sortOrder: update.sortOrder },
          });
        }
        const itemZone = dto.time_zone === undefined ? user.timeZone : this.zone(dto.time_zone);
        const startParsed = this.nextDate(null, dto.start_date, 'start_date', itemZone);
        const dueParsed = this.nextDate(null, dto.due_date, 'due_date', itemZone);
        const inferredAllDay = startParsed.dateOnly || dueParsed.dateOnly;
        const row = await tx.checklistItem.create({
          data: {
            ownerId: user.id,
            taskId,
            title: this.title(dto.title),
            sortOrder: plan.movingSortOrder,
            startDate: startParsed.date,
            dueDate: dueParsed.date,
            isAllDay: dto.is_all_day ?? (inferredAllDay ? true : false),
            timeZone: itemZone,
          },
        });
        const body = toChecklistJson(taskId, row);
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.checklistItemCreated,
          entityType: 'checklist_item',
          entityId: row.id,
          action: 'created',
          data: { checklist_item: asJson(body) },
          previous: null,
        });
        return body;
      },
    });
  }

  async updateItem(
    user: AuthUser,
    taskId: string,
    itemId: string,
    dto: UpdateChecklistItemDto,
  ): Promise<ChecklistItemJson> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.requireItem(tx, user.id, taskId, itemId);
      const reorder = dto.before_id !== undefined || dto.move_to_end === true;
      const rows = await tx.checklistItem.findMany({
        where: { ownerId: user.id, taskId, deletedAt: null },
        select: { id: true, sortOrder: true },
      });
      const plan = reorder ? placementPlan(rows, itemId, dto.before_id, dto.move_to_end) : null;
      if (plan !== null) {
        for (const update of plan.updates) {
          await tx.checklistItem.update({
            where: { id: update.id },
            data: { sortOrder: update.sortOrder },
          });
        }
      }
      const itemZone = dto.time_zone === undefined ? current.timeZone : this.zone(dto.time_zone);
      const startParsed =
        dto.start_date === undefined
          ? null
          : this.nextDate(current.startDate, dto.start_date, 'start_date', itemZone);
      const dueParsed =
        dto.due_date === undefined
          ? null
          : this.nextDate(current.dueDate, dto.due_date, 'due_date', itemZone);
      const inferredAllDay =
        (startParsed?.dateOnly ?? false) || (dueParsed?.dateOnly ?? false);
      const row = await tx.checklistItem.update({
        where: { id: itemId },
        data: {
          ...(dto.title !== undefined ? { title: this.title(dto.title) } : {}),
          ...(startParsed !== null ? { startDate: startParsed.date } : {}),
          ...(dueParsed !== null ? { dueDate: dueParsed.date } : {}),
          ...(dto.is_all_day !== undefined
            ? { isAllDay: dto.is_all_day }
            : inferredAllDay
              ? { isAllDay: true }
              : {}),
          ...(dto.time_zone !== undefined ? { timeZone: itemZone } : {}),
          ...(plan !== null ? { sortOrder: plan.movingSortOrder } : {}),
        },
      });
      const body = toChecklistJson(taskId, row);
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.checklistItemUpdated,
        entityType: 'checklist_item',
        entityId: itemId,
        action: 'updated',
        data: { checklist_item: asJson(body) },
        previous: asJson(toChecklistJson(taskId, current)),
      });
      return body;
    });
  }

  async deleteItem(user: AuthUser, taskId: string, itemId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.requireItem(tx, user.id, taskId, itemId);
      const row = await tx.checklistItem.update({
        where: { id: itemId },
        data: { deletedAt: new Date() },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.checklistItemDeleted,
        entityType: 'checklist_item',
        entityId: itemId,
        action: 'deleted',
        data: { checklist_item: asJson(toChecklistJson(taskId, row)) },
        previous: null,
      });
    });
  }

  async completeItem(user: AuthUser, taskId: string, itemId: string): Promise<ChecklistItemJson> {
    return this.setItemStatus(user, taskId, itemId, 'completed');
  }

  async uncompleteItem(user: AuthUser, taskId: string, itemId: string): Promise<ChecklistItemJson> {
    return this.setItemStatus(user, taskId, itemId, 'active');
  }

  async addAttachment(
    user: AuthUser,
    taskId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
  ): Promise<{
    id: string;
    file_name: string;
    mime_type: string;
    byte_size: number;
    has_thumbnail: boolean;
  }> {
    if (file === undefined || file.buffer.length === 0) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'file is required');
    }
    const mime = acceptedMime(file.buffer);
    await this.require(this.prisma, user.id, taskId, false);
    const onTask = await this.prisma.attachment.count({
      where: { taskId, ownerId: user.id, deletedAt: null },
    });
    if (onTask >= ATTACHMENT_MAX_PER_TASK) {
      throw new DomainException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        'attachment_quota',
        'This task has too many attachments',
      );
    }
    const usage = await this.prisma.attachment.aggregate({
      where: { ownerId: user.id, deletedAt: null },
      _sum: { byteSize: true },
    });
    if ((usage._sum.byteSize ?? 0) + file.buffer.length > ATTACHMENT_USER_QUOTA_BYTES) {
      throw new DomainException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        'attachment_quota',
        'Attachment quota exceeded',
      );
    }
    const storageKey = await writeAttachment(user.id, file.buffer);
    const thumbnailKey =
      isRasterImage(mime) && file.buffer.length <= 1_500_000
        ? await writeAttachment(user.id, file.buffer)
        : null;
    try {
      const row = await this.prisma.attachment.create({
        data: {
          ownerId: user.id,
          taskId,
          fileName: safeFileName(file.originalname),
          mimeType: mime,
          byteSize: file.buffer.length,
          storageKey,
          thumbnailKey,
          uploadedById: user.id,
        },
      });
      return {
        id: row.id,
        file_name: row.fileName,
        mime_type: row.mimeType,
        byte_size: row.byteSize,
        has_thumbnail: thumbnailKey !== null,
      };
    } catch (error) {
      await removeAttachmentFile(storageKey);
      if (thumbnailKey !== null) {
        await removeAttachmentFile(thumbnailKey);
      }
      throw error;
    }
  }

  async listAttachments(
    user: AuthUser,
    taskId: string,
  ): Promise<
    {
      id: string;
      file_name: string;
      mime_type: string;
      byte_size: number;
      has_thumbnail: boolean;
    }[]
  > {
    await this.require(this.prisma, user.id, taskId, false);
    const rows = await this.prisma.attachment.findMany({
      where: { ownerId: user.id, taskId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      file_name: row.fileName,
      mime_type: row.mimeType,
      byte_size: row.byteSize,
      has_thumbnail: row.thumbnailKey !== null,
    }));
  }

  async openThumbnail(
    user: AuthUser,
    taskId: string,
    attachmentId: string,
  ): Promise<{ absolute: string; fileName: string; mimeType: string }> {
    const row = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, ownerId: user.id, taskId, deletedAt: null },
    });
    if (row?.thumbnailKey == null) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'thumbnail_not_found',
        'This attachment has no thumbnail',
      );
    }
    return {
      absolute: resolveAttachment(row.thumbnailKey),
      fileName: row.fileName,
      mimeType: row.mimeType,
    };
  }

  async openAttachment(
    user: AuthUser,
    taskId: string,
    attachmentId: string,
  ): Promise<{ absolute: string; fileName: string; mimeType: string }> {
    const row = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, ownerId: user.id, taskId, deletedAt: null },
    });
    if (row === null) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'attachment_not_found',
        'Attachment was not found',
      );
    }
    return {
      absolute: resolveAttachment(row.storageKey),
      fileName: row.fileName,
      mimeType: row.mimeType,
    };
  }

  async deleteAttachment(user: AuthUser, taskId: string, attachmentId: string): Promise<void> {
    const row = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, ownerId: user.id, taskId, deletedAt: null },
    });
    if (row === null) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'attachment_not_found',
        'Attachment was not found',
      );
    }
    await this.prisma.attachment.update({
      where: { id: attachmentId },
      data: { deletedAt: new Date() },
    });
    await removeAttachmentFile(row.storageKey);
  }

  async listReminders(user: AuthUser, taskId: string): Promise<ReminderJson[]> {
    await this.require(this.prisma, user.id, taskId, false);
    const rows = await this.prisma.reminder.findMany({
      where: { ownerId: user.id, taskId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toReminderJson);
  }

  createReminder(
    user: AuthUser,
    taskId: string,
    dto: CreateReminderDto,
    keyRaw: string | undefined,
  ): Promise<{ statusCode: number; body: ReminderJson; replayed: boolean }> {
    const key = normalizeIdempotencyKey(keyRaw);
    return this.idempotency.run({
      ownerId: user.id,
      key,
      fingerprint: requestFingerprint('POST', `/api/v1/tasks/${taskId}/reminders`, dto),
      statusCode: 201,
      execute: async (tx) => {
        const task = await this.require(tx, user.id, taskId, false);
        this.assertReminder(dto, task.dueDate, task.startDate);
        const row = await tx.reminder.create({
          data: {
            ownerId: user.id,
            taskId,
            trigger: dto.trigger.trim(),
            type: dto.type,
            absoluteAt:
              dto.absolute_at === undefined || dto.absolute_at === null
                ? null
                : this.instant(dto.absolute_at, 'absolute_at', task.timeZone).date,
            channel: dto.channel ?? 'push',
            constant: dto.constant ?? false,
            constantIntervalMinutes:
              dto.constant === true ? (dto.constant_interval_minutes ?? 15) : null,
            location:
              dto.location === undefined || dto.location === null
                ? Prisma.DbNull
                : asJson(dto.location),
          },
        });
        return toReminderJson(row);
      },
    });
  }

  async deleteReminder(user: AuthUser, taskId: string, reminderId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.require(tx, user.id, taskId, false);
      const row = await tx.reminder.findFirst({
        where: { id: reminderId, ownerId: user.id, taskId, deletedAt: null },
      });
      if (row === null) {
        throw new DomainException(
          HttpStatus.NOT_FOUND,
          'reminder_not_found',
          'Reminder was not found',
        );
      }
      await tx.reminder.update({ where: { id: reminderId }, data: { deletedAt: new Date() } });
      await tx.reminderDelivery.deleteMany({ where: { reminderId, status: 'scheduled' } });
    });
  }

  async snoozeReminder(
    user: AuthUser,
    taskId: string,
    reminderId: string,
    preset: ReminderSnoozePreset,
    until: string | null,
  ): Promise<ReminderJson> {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.require(tx, user.id, taskId, false);
      const row = await tx.reminder.findFirst({
        where: { id: reminderId, ownerId: user.id, taskId, deletedAt: null },
      });
      if (row === null) {
        throw new DomainException(
          HttpStatus.NOT_FOUND,
          'reminder_not_found',
          'Reminder was not found',
        );
      }
      const snoozed = snoozeReminder({
        now: new Date().toISOString(),
        timeZone: task.timeZone,
        preset,
        ...(until === null ? {} : { until }),
      });
      if (!snoozed.ok) {
        throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', snoozed.reason);
      }
      const updated = await tx.reminder.update({
        where: { id: reminderId },
        data: { snoozedUntil: new Date(snoozed.until) },
      });
      await tx.reminderDelivery.deleteMany({ where: { reminderId, status: 'scheduled' } });
      return toReminderJson(updated);
    });
  }

  private assertReminder(dto: CreateReminderDto, due: Date | null, start: Date | null): void {
    if (dto.type === 'relative' && !parseTrigger(dto.trigger).ok) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'trigger is invalid');
    }
    if (dto.type === 'absolute' && (dto.absolute_at === undefined || dto.absolute_at === null)) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'absolute_at is required',
      );
    }
    if (dto.type === 'location' && (dto.location === undefined || dto.location === null)) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'location is required',
      );
    }
    const scheduled = reminderFireAt({
      trigger: dto.trigger,
      type: dto.type,
      dueDate: due === null ? null : due.toISOString(),
      startDate: start === null ? null : start.toISOString(),
      absoluteAt: dto.absolute_at ?? null,
    });
    if (!scheduled.ok && dto.type !== 'location') {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', scheduled.reason);
    }
  }

  private async insertTask(
    tx: Tx,
    user: AuthUser,
    dto: CreateTaskDto,
    source: 'manual' | 'api' = 'manual',
  ): Promise<CreatedTask> {
    const captured =
      dto.raw_text === undefined
        ? null
        : await resolveQuickAdd(tx, user, dto, new Date().toISOString());
    const projectId = captured?.projectId ?? dto.project_id;
    if (projectId === undefined) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'project_id is required',
      );
    }
    const project = await this.requireProject(tx, user.id, projectId);
    let parentId: string | null = null;
    if (dto.parent_id !== undefined && dto.parent_id !== null) {
      const parent = await this.require(tx, user.id, dto.parent_id, false);
      if (parent.parentId !== null) {
        throw new DomainException(
          HttpStatus.BAD_REQUEST,
          'subtask_depth',
          'Subtasks are only one level deep',
        );
      }
      const resolved = resolveSubtaskProject({
        requestedProjectId: project.id,
        parentProjectId: parent.projectId,
      });
      if (resolved.projectId !== project.id) {
        await this.requireProject(tx, user.id, resolved.projectId);
      }
      parentId = parent.id;
    }
    if (dto.column_id !== undefined && dto.column_id !== null) {
      const column = await this.requireColumn(tx, user.id, project.id, dto.column_id);
      await this.assertWip(tx, user.id, column, null);
    }
    const tagIds =
      captured === null || dto.tag_ids !== undefined
        ? await this.requireTags(tx, user.id, dto.tag_ids ?? [])
        : [...captured.tagIds];
    if (captured === null && dto.title === undefined) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'title is required');
    }
    const title = captured === null ? this.title(dto.title ?? '') : captured.title;
    const timeZone = dto.time_zone === undefined ? user.timeZone : this.zone(dto.time_zone);
    let content = dto.content ?? '';
    const extracted = dto.extract_checklist === true ? extractMarkdownChecklist(content) : null;
    if (extracted !== null) {
      content = extracted.content;
    }
    const capturedStart = dto.start_date !== undefined ? dto.start_date : captured?.startDate;
    const someday = dto.someday ?? captured?.someday ?? false;
    const startParsed = this.nextDate(null, someday ? null : capturedStart, 'start_date', timeZone);
    const dueParsed = this.nextDate(
      null,
      dto.due_date !== undefined ? dto.due_date : captured?.dueDate,
      'due_date',
      timeZone,
    );
    const start = startParsed.date;
    const due = dueParsed.date;
    const sortOrder = await this.planTaskSort(
      tx,
      user.id,
      project.id,
      parentId,
      null,
      dto.before_id,
      dto.move_to_end,
    );
    const repeatRule = this.canonicalRule(
      dto.repeat_rule !== undefined ? dto.repeat_rule : (captured?.repeatRule ?? null),
      due,
      timeZone,
    );
    const inferredAllDay = startParsed.dateOnly || dueParsed.dateOnly;
    const isAllDay = dto.is_all_day ?? captured?.isAllDay ?? (inferredAllDay ? true : false);
    this.assertTimed(due, isAllDay, timeZone);
    this.assertTimed(start, isAllDay, timeZone);
    const id = randomUUID();
    const row = await tx.task.create({
      data: {
        id,
        ownerId: user.id,
        projectId: project.id,
        parentId,
        columnId: dto.column_id ?? null,
        title,
        content,
        kind: dto.kind ?? 'task',
        priority: dto.priority ?? captured?.priority ?? 'none',
        isAllDay,
        startDate: start,
        dueDate: due,
        timeZone,
        durationMinutes: this.duration(
          someday ? null : start,
          due,
          dto.duration_minutes ?? captured?.durationMinutes ?? null,
        ),
        isSomeday: someday,
        eveningOnly: dto.evening_only ?? captured?.eveningOnly ?? false,
        repeatRule,
        repeatFrom: dto.repeat_from ?? 'due_date',
        seriesId: repeatRule === null ? null : id,
        recurrenceOpen: repeatRule !== null,
        sortOrder,
        createdById: user.id,
        source,
        metadata: asJson(dto.metadata ?? {}),
      },
    });
    await this.linkTags(tx, row.id, tagIds);
    if (dto.reminder_trigger !== null) {
      await this.ensureDefaultReminder(
        tx,
        user.id,
        project.id,
        row.id,
        due,
        row.kind,
        dto.reminder_trigger ?? captured?.reminderTrigger ?? null,
      );
    }

    if (extracted !== null) {
      await this.materializeExtract(tx, user, row, extracted.items, dto.extract_as ?? 'checklist');
    }
    const detail = await this.load(tx, user, row.id, false);
    await this.events.record(tx, actorOf(user), {
      type: detail.kind === 'note' ? DomainEvent.noteCreated : DomainEvent.taskCreated,
      entityType: detail.kind === 'note' ? 'note' : 'task',
      entityId: row.id,
      action: 'created',
      data: { task: asJson(taskEventSnapshot(detail)) },
      previous: null,
    });
    const created = await this.load(tx, user, row.id, false);
    const warnings = captured?.warnings ?? [];
    if (warnings.length === 0) {
      return created;
    }
    return { ...created, warnings };
  }

  private async completeIn(
    tx: Tx,
    user: AuthUser,
    id: string,
    choice: CompleteChildrenChoice | null,
    seriesOpts: { advance: 'one_period' | 'next_future'; materializeNext: boolean } = {
      advance: 'one_period',
      materializeNext: false,
    },
  ): Promise<CompletedTask> {
    const current = await this.require(tx, user.id, id, false);
    if (current.status === 'completed') {
      return this.load(tx, user, id, false);
    }
    const activeItems = await tx.checklistItem.count({
      where: { taskId: id, ownerId: user.id, status: 'active', deletedAt: null },
    });
    const activeChildren = await tx.task.count({
      where: { parentId: id, ownerId: user.id, status: 'active', deletedAt: null },
    });
    const decision = decideParentCompletion({
      activeChildCount: activeItems + activeChildren,
      choice,
      policy: user.completeChildren,
    });
    if (decision.action === 'needs_choice') {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'children_need_decision',
        'Choose what to do with active children',
        {
          active_child_count: decision.activeChildCount,
        },
      );
    }
    const now = new Date();
    let completedChildIds: string[] = [];
    if (decision.action === 'complete_with_children') {
      const items = await tx.checklistItem.findMany({
        where: { taskId: id, status: 'active', deletedAt: null },
        select: { id: true },
      });
      await tx.checklistItem.updateMany({
        where: { id: { in: items.map((item) => item.id) } },
        data: { status: 'completed', completedAt: now },
      });
      for (const item of items) {
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.checklistItemCompleted,
          entityType: 'checklist_item',
          entityId: item.id,
          action: 'completed',
          data: { checklist_item: { id: item.id, task_id: id, status: 'completed' } },
          previous: { status: 'active' },
        });
      }
      const children = await tx.task.findMany({
        where: { parentId: id, ownerId: user.id, status: 'active', deletedAt: null },
        select: { id: true },
      });
      await tx.task.updateMany({
        where: { id: { in: children.map((child) => child.id) } },
        data: { status: 'completed', completedAt: now },
      });
      await tx.checklistItem.updateMany({
        where: {
          taskId: { in: children.map((child) => child.id) },
          status: 'active',
          deletedAt: null,
        },
        data: { status: 'completed', completedAt: now },
      });
      completedChildIds = children.map((child) => child.id);
      for (const child of children) {
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.taskCompleted,
          entityType: 'task',
          entityId: child.id,
          action: 'completed',
          data: { task: { id: child.id, status: 'completed', parent_id: id } },
          previous: { status: 'active' },
        });
      }
    }
    await this.cancelDeliveries(tx, [id, ...completedChildIds]);
    const meta = this.isRecordMeta(current.metadata) ? { ...current.metadata } : {};
    if (
      current.repeatRule !== null &&
      current.seriesId !== null &&
      seriesOpts.advance === 'next_future'
    ) {
      meta.series_advance = 'next_future';
    } else {
      delete meta.series_advance;
    }
    await tx.task.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt: now,
        metadata: asJson(meta),
        fieldClocks: asJson(
          stampTerminal(readClocks(current.fieldClocks), now.toISOString(), 'complete'),
        ),
      },
    });
    const detail = await this.load(tx, user, id, false);
    await this.events.record(tx, actorOf(user), {
      type: DomainEvent.taskCompleted,
      entityType: 'task',
      entityId: id,
      action: 'completed',
      data: { task: asJson(taskEventSnapshot(detail)) },
      previous: { status: current.status },
    });

    if (current.repeatRule === null || current.seriesId === null) {
      return detail;
    }

    const source = await tx.task.findFirstOrThrow({
      where: { id },
      include: taskInclude,
    });
    const planned = await this.planSeriesSuccessor(
      tx,
      source,
      seriesOpts.advance,
      now.toISOString(),
    );

    if (seriesOpts.materializeNext) {
      if (planned === null) {
        const closedMeta = { ...meta };
        delete closedMeta.series_advance;
        await tx.task.update({
          where: { id },
          data: { recurrenceOpen: false, metadata: asJson(closedMeta) },
        });
        return {
          ...(await this.load(tx, user, id, false)),
          series: { materialized: false, next_due_date: null, eta_seconds: null },
        };
      }
      const open = await tx.task.findFirst({
        where: { seriesId: current.seriesId, status: 'active', deletedAt: null },
        select: { id: true },
      });
      if (open === null) {
        await this.insertSeriesSuccessor(tx, user, source, planned);
      }
      const cleared = { ...meta };
      delete cleared.series_advance;
      await tx.task.update({ where: { id }, data: { metadata: asJson(cleared) } });
      return {
        ...(await this.load(tx, user, id, false)),
        series: {
          materialized: true,
          next_due_date: planned.due.toISOString(),
          eta_seconds: null,
        },
      };
    }

    return {
      ...(await this.load(tx, user, id, false)),
      series: {
        materialized: false,
        next_due_date: planned?.due.toISOString() ?? null,
        eta_seconds: 60,
      },
    };
  }

  private async planSeriesSuccessor(
    tx: Tx,
    source: TaskWithBits,
    advance: 'one_period' | 'next_future',
    nowIso: string,
  ): Promise<{ due: Date; start: Date | null } | null> {
    if (source.repeatRule === null || source.seriesId === null) {
      return null;
    }
    const completedCount = await tx.task.count({
      where: { seriesId: source.seriesId, deletedAt: null, status: 'completed' },
    });
    const next = nextOccurrence({
      repeatRule: source.repeatRule,
      repeatFrom: source.repeatFrom,
      dueDate: source.dueDate === null ? null : source.dueDate.toISOString(),
      startDate: source.startDate === null ? null : source.startDate.toISOString(),
      completedAt: source.completedAt === null ? null : source.completedAt.toISOString(),
      timeZone: source.timeZone,
      isAllDay: source.isAllDay,
      occurrenceIndex: completedCount,
      advance,
      now: nowIso,
    });
    if (!next.ok || next.occurrence === null) {
      return null;
    }
    return {
      due: new Date(next.occurrence.dueDate),
      start: next.occurrence.startDate === null ? null : new Date(next.occurrence.startDate),
    };
  }

  private async insertSeriesSuccessor(
    tx: Tx,
    user: AuthUser,
    source: TaskWithBits,
    next: { due: Date; start: Date | null },
  ): Promise<string> {
    if (source.repeatRule === null || source.seriesId === null) {
      throw new DomainException(HttpStatus.CONFLICT, 'not_recurring', 'The task is not repeating');
    }
    const id = randomUUID();
    const duration = deriveDurationMinutes({
      startDate: next.start === null ? null : next.start.toISOString(),
      dueDate: next.due.toISOString(),
      explicit: source.durationMinutes,
    });
    await tx.task.create({
      data: {
        id,
        ownerId: source.ownerId,
        projectId: source.projectId,
        parentId: source.parentId,
        columnId: source.columnId,
        title: source.title,
        content: source.content,
        kind: source.kind,
        priority: source.priority,
        isAllDay: source.isAllDay,
        startDate: next.start,
        dueDate: next.due,
        timeZone: source.timeZone,
        durationMinutes: duration.ok ? duration.durationMinutes : source.durationMinutes,
        eveningOnly: false,
        isSomeday: source.isSomeday,
        repeatRule: source.repeatRule,
        repeatFrom: source.repeatFrom,
        seriesId: source.seriesId,
        recurrenceOpen: true,
        sortOrder: source.sortOrder,
        createdById: source.createdById,
        source: 'automation',
      },
    });
    let itemOrder = 0n;
    for (const item of source.checklist) {
      itemOrder = sortOrderAtEnd(itemOrder === 0n ? null : itemOrder);
      await tx.checklistItem.create({
        data: {
          ownerId: source.ownerId,
          taskId: id,
          title: item.title,
          status: 'active',
          sortOrder: itemOrder,
          isAllDay: item.isAllDay,
          timeZone: item.timeZone,
          startDate: item.startDate,
          dueDate: item.dueDate,
        },
      });
    }
    const reminders = await tx.reminder.findMany({
      where: { taskId: source.id, deletedAt: null },
    });
    for (const reminder of reminders) {
      await tx.reminder.create({
        data: {
          ownerId: source.ownerId,
          taskId: id,
          type: reminder.type,
          trigger: reminder.trigger,
          absoluteAt: reminder.absoluteAt,
          channel: reminder.channel,
        },
      });
    }
    await this.linkTags(
      tx,
      id,
      source.tags.map((tag) => tag.tagId),
    );
    const detail = await this.load(tx, user, id, false);
    await this.events.record(tx, actorOf(user), {
      type: source.kind === 'note' ? DomainEvent.noteCreated : DomainEvent.taskCreated,
      entityType: source.kind === 'note' ? 'note' : 'task',
      entityId: id,
      action: 'created',
      data: {
        task: asJson(taskEventSnapshot(detail)),
        materialized_from: source.id,
      },
      previous: null,
    });
    return id;
  }

  private isRecordMeta(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private async copyTask(
    tx: Tx,
    user: AuthUser,
    source: TaskWithBits,
    projectId: string,
    parentId: string | null,
  ): Promise<string> {
    const sortOrder = await this.planTaskSort(
      tx,
      user.id,
      projectId,
      parentId,
      null,
      undefined,
      true,
    );
    const id = randomUUID();
    const repeating = source.repeatRule !== null;
    const copy = await tx.task.create({
      data: {
        id,
        ownerId: user.id,
        seriesId: repeating ? id : null,
        recurrenceOpen: repeating,
        projectId,
        parentId,
        columnId: parentId === null ? source.columnId : null,
        title: source.title,
        content: source.content,
        kind: source.kind,
        priority: source.priority,
        isAllDay: source.isAllDay,
        startDate: source.startDate,
        dueDate: source.dueDate,
        timeZone: source.timeZone,
        durationMinutes: source.durationMinutes,
        repeatRule: source.repeatRule,
        repeatFrom: source.repeatFrom,
        sortOrder,
        createdById: user.id,
        source: 'manual',
        metadata: source.metadata ?? {},
      },
    });
    await this.linkTags(
      tx,
      copy.id,
      source.tags.map((tag) => tag.tagId),
    );
    let itemOrder = 0n;
    for (const item of source.checklist) {
      itemOrder = sortOrderAtEnd(itemOrder === 0n ? null : itemOrder);
      await tx.checklistItem.create({
        data: {
          ownerId: user.id,
          taskId: copy.id,
          title: item.title,
          status: 'active',
          sortOrder: itemOrder,
          isAllDay: item.isAllDay,
          timeZone: item.timeZone,
          startDate: item.startDate,
          dueDate: item.dueDate,
        },
      });
    }
    if (parentId === null) {
      const children = await tx.task.findMany({
        where: { ownerId: user.id, parentId: source.id, deletedAt: null },
        include: taskInclude,
      });
      for (const child of children) {
        await this.copyTask(tx, user, child, projectId, copy.id);
      }
    }
    const detail = await this.load(tx, user, copy.id, false);
    await this.events.record(tx, actorOf(user), {
      type: DomainEvent.taskCreated,
      entityType: 'task',
      entityId: copy.id,
      action: 'created',
      data: { task: asJson(taskEventSnapshot(detail)), duplicated_from: source.id },
      previous: null,
    });
    return copy.id;
  }

  private async materializeExtract(
    tx: Tx,
    user: AuthUser,
    task: Task,
    items: readonly { title: string; status: 'active' | 'completed' }[],
    as: 'checklist' | 'subtask',
  ): Promise<void> {
    let order = 0n;
    for (const item of items) {
      order = sortOrderAtEnd(order === 0n ? null : order);
      if (as === 'subtask') {
        if (task.parentId !== null) {
          throw new DomainException(
            HttpStatus.BAD_REQUEST,
            'subtask_depth',
            'Subtasks are only one level deep',
          );
        }
        await tx.task.create({
          data: {
            ownerId: user.id,
            projectId: task.projectId,
            parentId: task.id,
            title: item.title,
            status: item.status === 'completed' ? 'completed' : 'active',
            completedAt: item.status === 'completed' ? new Date() : null,
            timeZone: task.timeZone,
            sortOrder: order,
            createdById: user.id,
            source: 'manual',
          },
        });
      } else {
        await tx.checklistItem.create({
          data: {
            ownerId: user.id,
            taskId: task.id,
            title: item.title,
            status: item.status,
            completedAt: item.status === 'completed' ? new Date() : null,
            sortOrder: order,
            timeZone: task.timeZone,
          },
        });
      }
    }
  }

  private async setItemStatus(
    user: AuthUser,
    taskId: string,
    itemId: string,
    status: 'active' | 'completed',
  ): Promise<ChecklistItemJson> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.requireItem(tx, user.id, taskId, itemId);
      const row = await tx.checklistItem.update({
        where: { id: itemId },
        data: { status, completedAt: status === 'completed' ? new Date() : null },
      });
      const body = toChecklistJson(taskId, row);
      await this.events.record(tx, actorOf(user), {
        type:
          status === 'completed'
            ? DomainEvent.checklistItemCompleted
            : DomainEvent.checklistItemUncompleted,
        entityType: 'checklist_item',
        entityId: itemId,
        action: status === 'completed' ? 'completed' : 'updated',
        data: { checklist_item: asJson(body) },
        previous: { status: current.status },
      });
      return body;
    });
  }

  private async emitUpdated(tx: Tx, user: AuthUser, id: string): Promise<void> {
    const detail = await this.load(tx, user, id, false);
    await this.events.record(tx, actorOf(user), {
      type: DomainEvent.taskUpdated,
      entityType: 'task',
      entityId: id,
      action: 'updated',
      data: { task: asJson(taskEventSnapshot(detail)) },
      previous: null,
    });
  }

  private async load(
    tx: Tx | PrismaService,
    user: AuthUser | string,
    id: string,
    deleted: boolean,
  ): Promise<TaskDetail> {
    const ownerId = typeof user === 'string' ? user : user.id;
    const listIds = typeof user === 'string' ? null : user.listIds;
    const row = await tx.task.findFirst({
      where: { id, ownerId, ...(deleted ? { deletedAt: { not: null } } : { deletedAt: null }) },
      include: {
        ...taskInclude,
        children: {
          where: { deletedAt: null },
          include: {
            tags: { where: { tag: { deletedAt: null } }, select: { tagId: true } },
            checklist: { where: { deletedAt: null }, select: { status: true } },
          },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (row === null || !listVisible(listIds, row.projectId)) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'task_not_found', 'Task was not found');
    }
    const activity = await tx.activityLog.findMany({
      where: { ownerId, entityType: 'task', entityId: id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      ...toTaskSummary(row, progressOf(row.checklist)),
      items: row.checklist.map((item) => toChecklistJson(id, item)),
      subtasks: row.children.map((child) => toTaskSummary(child, progressOf(child.checklist))),
      activity: activity.map((entry) => ({
        id: entry.id,
        action: entry.action,
        changes: entry.changes,
        created_at: entry.createdAt.toISOString(),
        actor_id: entry.actorId,
      })),
    };
  }

  private async planTaskSort(
    tx: Tx,
    ownerId: string,
    projectId: string,
    parentId: string | null,
    movingId: string | null,
    beforeId: string | null | undefined,
    moveToEnd: boolean | undefined,
  ): Promise<bigint> {
    const rows = await tx.task.findMany({
      where: { ownerId, projectId, parentId, deletedAt: null },
      select: { id: true, sortOrder: true },
    });
    const plan = placementPlan(rows, movingId, beforeId, moveToEnd);
    for (const update of plan.updates) {
      await tx.task.update({ where: { id: update.id }, data: { sortOrder: update.sortOrder } });
    }
    return plan.movingSortOrder;
  }

  private async progressMap(
    ids: string[],
  ): Promise<Map<string, { completed: number; total: number }>> {
    const map = new Map<string, { completed: number; total: number }>();
    if (ids.length === 0) {
      return map;
    }
    const grouped = await this.prisma.checklistItem.groupBy({
      by: ['taskId', 'status'],
      where: { taskId: { in: ids }, deletedAt: null },
      _count: { _all: true },
    });
    for (const row of grouped) {
      const current = map.get(row.taskId) ?? { completed: 0, total: 0 };
      current.total += row._count._all;
      if (row.status === 'completed') {
        current.completed += row._count._all;
      }
      map.set(row.taskId, current);
    }
    return map;
  }

  private async searchIds(ownerId: string, q: string): Promise<string[]> {
    const trimmed = q.trim();
    if (trimmed.length === 0) {
      return [];
    }
    try {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM tasks
        WHERE owner_id = ${ownerId}::uuid
          AND deleted_at IS NULL
          AND search_vector @@ plainto_tsquery('simple', ${trimmed})
      `;
      return rows.map((row) => row.id);
    } catch {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'search query is invalid',
      );
    }
  }

  private async tagScope(
    ownerId: string,
    tagId: string,
    includeDescendants: boolean,
  ): Promise<string[]> {
    const tags = await this.prisma.tag.findMany({
      where: { ownerId, deletedAt: null },
      select: { id: true, parentId: true },
    });
    if (!tags.some((tag) => tag.id === tagId)) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'tag_not_found', 'Tag was not found');
    }
    if (!includeDescendants) {
      return [tagId];
    }
    const children = new Map<string, string[]>();
    for (const tag of tags) {
      if (tag.parentId === null) {
        continue;
      }
      const list = children.get(tag.parentId) ?? [];
      list.push(tag.id);
      children.set(tag.parentId, list);
    }
    return [tagId, ...tagDescendantIds(tagId, children)];
  }

  private async require(
    tx: Tx | PrismaService,
    ownerId: string,
    id: string,
    deleted: boolean,
  ): Promise<Task> {
    const row = await tx.task.findFirst({
      where: { id, ownerId, ...(deleted ? { deletedAt: { not: null } } : { deletedAt: null }) },
    });
    if (row === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'task_not_found', 'Task was not found');
    }
    return row;
  }

  private async requireProject(tx: Tx, ownerId: string, id: string): Promise<{ id: string }> {
    const row = await tx.project.findFirst({
      where: { id, ownerId, deletedAt: null },
      select: { id: true },
    });
    if (row === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'project_not_found', 'List was not found');
    }
    return row;
  }

  private async requireColumn(
    tx: Tx,
    ownerId: string,
    projectId: string,
    id: string,
  ): Promise<{ id: string; wipLimit: number | null }> {
    const row = await tx.column.findFirst({
      where: { id, ownerId, projectId, deletedAt: null },
      select: { id: true, wipLimit: true },
    });
    if (row === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'column_not_found', 'Section was not found');
    }
    return row;
  }

  /** RF-1002. A card already in the column is excluded from the count. */
  private async assertWip(
    tx: Tx,
    ownerId: string,
    column: { id: string; wipLimit: number | null },
    movingTaskId: string | null,
  ): Promise<void> {
    const count = await tx.task.count({
      where: {
        ownerId,
        columnId: column.id,
        deletedAt: null,
        status: 'active',
        ...(movingTaskId === null ? {} : { id: { not: movingTaskId } }),
      },
    });
    if (!acceptsColumnDrop(count, column.wipLimit, false)) {
      throw new DomainException(HttpStatus.CONFLICT, 'wip_exceeded', 'Column WIP limit reached');
    }
  }

  private async requireTags(tx: Tx, ownerId: string, ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }
    const unique = [...new Set(ids)];
    const rows = await tx.tag.findMany({
      where: { ownerId, id: { in: unique }, deletedAt: null },
      select: { id: true },
    });
    if (rows.length !== unique.length) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'tag_not_found', 'Tag was not found');
    }
    return unique;
  }

  private async requireItem(tx: Tx, ownerId: string, taskId: string, id: string) {
    await this.require(tx, ownerId, taskId, false);
    const row = await tx.checklistItem.findFirst({
      where: { id, ownerId, taskId, deletedAt: null },
    });
    if (row === null) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'checklist_item_not_found',
        'Checklist item was not found',
      );
    }
    return row;
  }

  private assertTimed(value: Date | null, isAllDay: boolean, timeZone: string): void {
    if (allDayClockConflict(value === null ? null : value.toISOString(), isAllDay, timeZone)) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'an all-day task cannot include a clock time',
      );
    }
  }

  private async cancelDeliveries(tx: Tx, taskIds: readonly string[]): Promise<void> {
    if (taskIds.length === 0) {
      return;
    }
    await tx.reminderDelivery.updateMany({
      where: { taskId: { in: [...taskIds] }, status: 'scheduled' },
      data: { status: 'cancelled' },
    });
  }

  private async ensureDefaultReminder(
    tx: Tx,
    userId: string,
    projectId: string,
    taskId: string,
    due: Date | null,
    kind: string,
    explicit: string | null,
  ): Promise<void> {
    if (due === null || kind === 'note') {
      return;
    }
    if (explicit !== null) {
      await tx.reminder.create({
        data: {
          ownerId: userId,
          taskId,
          trigger: explicit,
          type: 'relative',
          channel: 'push',
        },
      });
      return;
    }
    const existing = await tx.reminder.count({
      where: { taskId, ownerId: userId, deletedAt: null },
    });
    if (existing > 0) {
      return;
    }
    const [owner, list] = await Promise.all([
      tx.user.findFirst({
        where: { id: userId },
        select: { defaultReminderTrigger: true },
      }),
      tx.project.findFirst({
        where: { id: projectId },
        select: { defaultReminderTrigger: true },
      }),
    ]);
    const trigger = resolveDefaultReminder(
      owner?.defaultReminderTrigger ?? null,
      list?.defaultReminderTrigger ?? null,
    );
    if (trigger === null) {
      return;
    }
    await tx.reminder.create({
      data: {
        ownerId: userId,
        taskId,
        trigger,
        type: 'relative',
        channel: 'push',
      },
    });
  }

  private async linkTags(tx: Tx, taskId: string, tagIds: readonly string[]): Promise<void> {
    if (tagIds.length === 0) {
      return;
    }
    await tx.taskTag.createMany({
      data: tagIds.map((tagId) => ({ taskId, tagId })),
      skipDuplicates: true,
    });
  }

  private title(value: string): string {
    const title = normalizeTaskTitle(value);
    if (!title.ok) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'title is required');
    }
    return title.title;
  }

  private zone(value: string): string {
    if (!isIanaTimeZone(value)) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'time_zone is not a valid IANA name',
      );
    }
    return value;
  }

  private canonicalRule(value: string | null, due: Date | null, timeZone: string): string | null {
    if (value === null) {
      return null;
    }
    const canonical = canonicalizeRepeatRule(
      value,
      due === null ? null : due.toISOString(),
      timeZone,
    );
    if (!canonical.ok) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        canonical.reason === 'missing_anchor'
          ? 'a repeating task needs a due_date'
          : 'repeat_rule must be an RRULE',
      );
    }
    return value;
  }

  private async overdueIds(ownerId: string): Promise<string[]> {
    return listOverdueTaskIds(this.prisma, ownerId);
  }

  private instant(
    value: string,
    field: string,
    timeZone: string,
  ): { date: Date; dateOnly: boolean } {
    const parsed = parseTaskInstant(value, timeZone);
    if (!parsed.ok) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        `${field} is not a valid date`,
      );
    }
    return { date: new Date(parsed.iso), dateOnly: parsed.dateOnly };
  }

  private nextDate(
    current: Date | null,
    incoming: string | null | undefined,
    field: string,
    timeZone: string,
  ): { date: Date | null; dateOnly: boolean } {
    if (incoming === undefined) {
      return { date: current, dateOnly: false };
    }
    if (incoming === null) {
      return { date: null, dateOnly: false };
    }
    return this.instant(incoming, field, timeZone);
  }

  private duration(start: Date | null, due: Date | null, explicit: number | null): number | null {
    const derived = deriveDurationMinutes({
      startDate: start === null ? null : start.toISOString(),
      dueDate: due === null ? null : due.toISOString(),
      explicit,
    });
    if (!derived.ok) {
      if (derived.reason === 'duration_mismatch') {
        throw new DomainException(
          HttpStatus.BAD_REQUEST,
          'validation_failed',
          'duration_minutes does not match start_date/due_date',
        );
      }
      throw new DomainException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'deadline_before_when',
        'deadline is before when',
      );
    }
    return derived.durationMinutes;
  }

  private updateEvent(before: 'task' | 'note', after: 'task' | 'note'): string {
    if (after === 'note' && before === 'task') {
      return DomainEvent.noteCreated;
    }
    if (after === 'note') {
      return DomainEvent.noteUpdated;
    }
    return DomainEvent.taskUpdated;
  }
}

interface ReminderJson {
  id: string;
  task_id: string;
  trigger: string;
  type: 'relative' | 'absolute' | 'location' | 'daily_digest';
  absolute_at: string | null;
  channel: 'push' | 'email' | 'both';
  constant: boolean;
  constant_interval_minutes: number | null;
  snoozed_until: string | null;
}

function toReminderJson(row: {
  id: string;
  taskId: string;
  trigger: string;
  type: ReminderJson['type'];
  absoluteAt: Date | null;
  channel: ReminderJson['channel'];
  constant: boolean;
  constantIntervalMinutes: number | null;
  snoozedUntil: Date | null;
}): ReminderJson {
  return {
    id: row.id,
    task_id: row.taskId,
    trigger: row.trigger,
    type: row.type,
    absolute_at: row.absoluteAt === null ? null : row.absoluteAt.toISOString(),
    channel: row.channel,
    constant: row.constant,
    constant_interval_minutes: row.constantIntervalMinutes,
    snoozed_until: row.snoozedUntil === null ? null : row.snoozedUntil.toISOString(),
  };
}

function intersectIds(left: string[] | null, right: string[] | null): string[] | null {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  const allowed = new Set(right);
  return left.filter((id) => allowed.has(id));
}
