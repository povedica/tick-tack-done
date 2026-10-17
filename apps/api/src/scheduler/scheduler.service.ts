import { randomUUID } from 'node:crypto';
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma, type ReminderChannel } from '@prisma/client';
import {
  deriveDurationMinutes,
  isOverdue,
  nextConstantFire,
  nextDailyReminder,
  nextOccurrence,
  REMINDER_HORIZON_MS,
  reminderDisposition,
  reminderFireAt,
} from '@reflexionia/domain';
import type { EventActor } from '../auth/auth-user';
import { DomainEvent } from '../events/domain-events';
import { EventRecorder } from '../events/event-recorder';
import { asJson } from '../http/json';
import { PrismaService } from '../prisma/prisma.service';
import type { Tx } from '../prisma/tx';
import { ReminderTransport } from './reminder.transport';

const TICK_MS = 60_000;
const DUE_SOON_MS = 24 * 60 * 60 * 1000;
const taskInclude = {
  checklist: { where: { deletedAt: null } },
  reminders: { where: { deletedAt: null } },
  tags: true,
  children: {
    where: { deletedAt: null },
    include: { checklist: { where: { deletedAt: null } }, tags: true },
  },
} satisfies Prisma.TaskInclude;

type SeriesTask = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(ReminderTransport) private readonly transport: ReminderTransport,
  ) {}

  onModuleInit(): void {
    if (!schedulerAutostart()) {
      return;
    }
    void this.run(new Date(), true);
    this.timer = setInterval(() => {
      void this.run(new Date(), false);
    }, TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
    }
  }

  /** Materializes the next occurrence and fires reminders. catchUp marks already-due work as late. */
  async run(
    now: Date,
    catchUp: boolean,
  ): Promise<{ materialized: number; fired: number; late: number }> {
    const materialized = (await this.advanceCompleted()) + (await this.advanceDetached());
    await this.enqueueReminders(now, catchUp);
    await this.enqueueDigests(now, catchUp);
    await this.enqueueSignals(now);
    const fired = await this.fire(now, catchUp);
    return { materialized, fired: fired.fired, late: fired.late };
  }

  private async advanceCompleted(): Promise<number> {
    const rows = await this.prisma.task.findMany({
      where: {
        status: 'completed',
        deletedAt: null,
        repeatRule: { not: null },
        seriesId: { not: null },
        recurrenceOpen: true,
      },
      include: taskInclude,
    });
    let created = 0;
    for (const row of rows) {
      if (row.seriesId === null || row.repeatRule === null) {
        continue;
      }
      const open = await this.prisma.task.findFirst({
        where: { seriesId: row.seriesId, status: 'active', deletedAt: null },
        select: { id: true },
      });
      if (open !== null) {
        continue;
      }
      const made = await this.materialize(row, row.repeatRule, row.seriesId);
      if (made) {
        created += 1;
      }
    }
    return created;
  }

  private async advanceDetached(): Promise<number> {
    const rows = await this.prisma.seriesAdvance.findMany({ where: { processedAt: null } });
    let created = 0;
    for (const row of rows) {
      const open = await this.prisma.task.findFirst({
        where: { seriesId: row.seriesId, status: 'active', deletedAt: null },
        select: { id: true },
      });
      const source = await this.prisma.task.findFirst({
        where: { id: row.sourceTaskId },
        include: taskInclude,
      });
      if (open !== null || source === null) {
        await this.prisma.seriesAdvance.update({
          where: { id: row.id },
          data: { processedAt: new Date() },
        });
        continue;
      }
      const made = await this.materialize(source, row.repeatRule, row.seriesId, row.dueDate);
      if (made) {
        created += 1;
      }
      await this.prisma.seriesAdvance.update({
        where: { id: row.id },
        data: { processedAt: new Date() },
      });
    }
    return created;
  }

  private async materialize(
    source: SeriesTask,
    repeatRule: string,
    seriesId: string,
    anchorDue: Date | null = source.dueDate,
  ): Promise<boolean> {
    const completedCount = await this.prisma.task.count({
      where: { seriesId, deletedAt: null, status: 'completed' },
    });
    const next = nextOccurrence({
      repeatRule,
      repeatFrom: source.repeatFrom,
      dueDate: anchorDue === null ? null : anchorDue.toISOString(),
      startDate: source.startDate === null ? null : source.startDate.toISOString(),
      completedAt: source.completedAt === null ? null : source.completedAt.toISOString(),
      timeZone: source.timeZone,
      isAllDay: source.isAllDay,
      occurrenceIndex: completedCount,
    });
    if (!next.ok || next.occurrence === null) {
      if (source.recurrenceOpen) {
        await this.prisma.task.update({
          where: { id: source.id },
          data: { recurrenceOpen: false },
        });
      }
      return false;
    }
    const due = new Date(next.occurrence.dueDate);
    const start = next.occurrence.startDate === null ? null : new Date(next.occurrence.startDate);
    try {
      await this.prisma.$transaction((tx) =>
        this.insertSuccessor(tx, source, { seriesId, repeatRule, due, start }),
      );
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  private async insertSuccessor(
    tx: Tx,
    source: SeriesTask,
    next: { seriesId: string; repeatRule: string; due: Date; start: Date | null },
  ): Promise<void> {
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
        repeatRule: next.repeatRule,
        repeatFrom: source.repeatFrom,
        seriesId: next.seriesId,
        recurrenceOpen: true,
        sortOrder: source.sortOrder,
        createdById: source.createdById,
        source: 'automation',
      },
    });
    await this.copyChecklist(tx, source.ownerId, id, source.checklist);
    await this.copyReminders(tx, source.ownerId, id, source.reminders);
    await this.copyTags(
      tx,
      id,
      source.tags.map((tag) => tag.tagId),
    );
    for (const child of source.children) {
      const childId = randomUUID();
      await tx.task.create({
        data: {
          id: childId,
          ownerId: source.ownerId,
          projectId: child.projectId,
          parentId: id,
          columnId: child.columnId,
          title: child.title,
          content: child.content,
          kind: child.kind,
          priority: child.priority,
          isAllDay: child.isAllDay,
          startDate: child.startDate,
          dueDate: child.dueDate,
          timeZone: child.timeZone,
          durationMinutes: child.durationMinutes,
          repeatRule: child.repeatRule,
          repeatFrom: child.repeatFrom,
          seriesId: child.repeatRule === null ? null : childId,
          recurrenceOpen: child.repeatRule !== null,
          sortOrder: child.sortOrder,
          createdById: child.createdById,
          source: 'automation',
        },
      });
      await this.copyChecklist(tx, source.ownerId, childId, child.checklist);
      await this.copyTags(
        tx,
        childId,
        child.tags.map((tag) => tag.tagId),
      );
    }
    await this.events.record(tx, automation(source.ownerId), {
      type: source.kind === 'note' ? DomainEvent.noteCreated : DomainEvent.taskCreated,
      entityType: source.kind === 'note' ? 'note' : 'task',
      entityId: id,
      action: 'created',
      data: asJson({
        task: {
          id,
          title: source.title,
          due_date: next.due.toISOString(),
          series_id: next.seriesId,
        },
        materialized_from: source.id,
      }),
      previous: null,
    });
  }

  private async enqueueReminders(now: Date, catchUp: boolean): Promise<void> {
    const reminders = await this.prisma.reminder.findMany({
      where: { deletedAt: null, task: { status: 'active', deletedAt: null } },
      include: {
        task: { select: { dueDate: true, startDate: true, title: true, timeZone: true } },
      },
    });
    for (const reminder of reminders) {
      const natural = reminderFireAt({
        trigger: reminder.trigger,
        type: reminder.type,
        dueDate: iso(reminder.task.dueDate),
        startDate: iso(reminder.task.startDate),
        absoluteAt: iso(reminder.absoluteAt),
      });
      if (!natural.ok || natural.fireAt === null) {
        continue;
      }
      const snoozed = reminder.snoozedUntil;
      const fireAt =
        snoozed !== null && snoozed.getTime() > Date.parse(natural.fireAt)
          ? snoozed.toISOString()
          : natural.fireAt;
      await this.queue({
        ownerId: reminder.ownerId,
        reminderId: reminder.id,
        taskId: reminder.taskId,
        dedupeKey: `reminder:${reminder.id}:${fireAt}`,
        fireAt,
        channel: reminder.channel,
        kind: 'task',
        now,
        catchUp,
        payload: { title: reminder.task.title, body: `Recordatorio: ${reminder.task.title}` },
      });
    }
  }

  private async enqueueDigests(now: Date, catchUp: boolean): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, dailyReminderTime: { not: null } },
      select: { id: true, email: true, timeZone: true, dailyReminderTime: true },
    });
    for (const user of users) {
      if (user.dailyReminderTime === null) {
        continue;
      }
      const next = nextDailyReminder({
        time: user.dailyReminderTime,
        timeZone: user.timeZone,
        now: now.toISOString(),
      });
      if (!next.ok) {
        continue;
      }
      const tasks = await this.prisma.task.findMany({
        where: {
          ownerId: user.id,
          status: 'active',
          deletedAt: null,
          parentId: null,
          dueDate: { not: null },
        },
        orderBy: { dueDate: 'asc' },
        take: 20,
        select: { title: true, dueDate: true, isAllDay: true, timeZone: true, status: true },
      });
      const lines = tasks
        .filter(
          (task) =>
            task.dueDate !== null &&
            (isOverdue({
              status: 'active',
              dueDate: task.dueDate.toISOString(),
              isAllDay: task.isAllDay,
              timeZone: task.timeZone,
              now: now.toISOString(),
            }) ||
              sameLocalDay(task.dueDate.toISOString(), next.fireAt, task.timeZone)),
        )
        .map((task) => `- ${task.title}`);
      await this.queue({
        ownerId: user.id,
        reminderId: null,
        taskId: null,
        dedupeKey: `digest:${user.id}:${next.fireAt}`,
        fireAt: next.fireAt,
        channel: 'both',
        kind: 'daily_digest',
        now,
        catchUp,
        payload: {
          title: 'Planifica tu día',
          body: lines.length === 0 ? 'No hay tareas con fecha para hoy.' : lines.join('\n'),
          email: user.email,
        },
      });
    }
  }

  private async enqueueSignals(now: Date): Promise<void> {
    const horizon = new Date(now.getTime() + DUE_SOON_MS);
    const tasks = await this.prisma.task.findMany({
      where: { status: 'active', deletedAt: null, dueDate: { not: null, lte: horizon } },
      select: {
        id: true,
        ownerId: true,
        title: true,
        dueDate: true,
        isAllDay: true,
        timeZone: true,
        status: true,
      },
    });
    for (const task of tasks) {
      if (task.dueDate === null) {
        continue;
      }
      const due = task.dueDate.toISOString();
      const overdue = isOverdue({
        status: 'active',
        dueDate: due,
        isAllDay: task.isAllDay,
        timeZone: task.timeZone,
        now: now.toISOString(),
      });
      const kind = overdue ? 'overdue' : 'due_soon';
      await this.queue({
        ownerId: task.ownerId,
        reminderId: null,
        taskId: task.id,
        dedupeKey: `${kind}:${task.id}:${due}`,
        fireAt: overdue ? now.toISOString() : due,
        channel: 'push',
        kind,
        now,
        catchUp: false,
        payload: { title: task.title, due },
      });
    }
  }

  private async queue(input: {
    ownerId: string;
    reminderId: string | null;
    taskId: string | null;
    dedupeKey: string;
    fireAt: string;
    channel: ReminderChannel;
    kind: 'task' | 'daily_digest' | 'overdue' | 'due_soon';
    now: Date;
    catchUp: boolean;
    payload: Prisma.InputJsonObject;
  }): Promise<void> {
    const at = Date.parse(input.fireAt);
    if (Number.isNaN(at)) {
      return;
    }
    const tooOld = input.now.getTime() - at > REMINDER_HORIZON_MS;
    const disposition = reminderDisposition(
      input.fireAt,
      input.now.toISOString(),
      input.catchUp || tooOld,
    );
    if (disposition === 'beyond_horizon') {
      return;
    }
    const existing = await this.prisma.reminderDelivery.findUnique({
      where: { dedupeKey: input.dedupeKey },
      select: { id: true },
    });
    if (existing !== null) {
      return;
    }
    await this.prisma.reminderDelivery.create({
      data: {
        ownerId: input.ownerId,
        reminderId: input.reminderId,
        taskId: input.taskId,
        dedupeKey: input.dedupeKey,
        fireAt: new Date(input.fireAt),
        channel: input.channel,
        kind: input.kind,
        status: tooOld ? 'late' : 'scheduled',
        firedAt: tooOld ? input.now : null,
        payload: input.payload,
      },
    });
  }

  private async fire(now: Date, catchUp: boolean): Promise<{ fired: number; late: number }> {
    const due = await this.prisma.reminderDelivery.findMany({
      where: { status: 'scheduled', fireAt: { lte: now } },
      include: {
        owner: { select: { email: true, pushSubscriptions: { where: { deletedAt: null } } } },
        reminder: { select: { constant: true, constantIntervalMinutes: true, taskId: true } },
      },
    });
    let fired = 0;
    let late = 0;
    for (const row of due) {
      const mark = catchUp && row.fireAt.getTime() < now.getTime() ? 'late' : 'fired';
      const payload = asRecord(row.payload);
      if (row.kind === 'task' || row.kind === 'daily_digest') {
        const result = await this.transport.deliver({
          channel: row.channel,
          email: typeof payload.email === 'string' ? payload.email : row.owner.email,
          subscriptions: row.owner.pushSubscriptions,
          title: typeof payload.title === 'string' ? payload.title : 'Recordatorio',
          body: typeof payload.body === 'string' ? payload.body : '',
        });
        await this.prisma.$transaction(async (tx) => {
          await tx.reminderDelivery.update({
            where: { id: row.id },
            data: { status: mark, firedAt: now, payload: asJson({ ...payload, delivery: result }) },
          });
          await this.events.record(tx, automation(row.ownerId), {
            type: DomainEvent.reminderFired,
            entityType: 'reminder',
            entityId: row.reminderId ?? row.id,
            action: 'updated',
            data: asJson({
              delivery_id: row.id,
              kind: row.kind,
              status: mark,
              task_id: row.taskId,
            }),
            previous: null,
          });
        });
        if (row.kind === 'task' && row.reminder?.constant === true && row.taskId !== null) {
          await this.scheduleConstant(row, now);
        }
      } else {
        await this.prisma.$transaction(async (tx) => {
          await tx.reminderDelivery.update({
            where: { id: row.id },
            data: { status: mark, firedAt: now },
          });
          if (row.taskId !== null) {
            await this.events.record(tx, automation(row.ownerId), {
              type: row.kind === 'overdue' ? DomainEvent.taskOverdue : DomainEvent.taskDueSoon,
              entityType: 'task',
              entityId: row.taskId,
              action: 'updated',
              data: asJson({ task: { id: row.taskId, title: payload.title }, status: mark }),
              previous: null,
            });
          }
        });
      }
      if (mark === 'late') {
        late += 1;
      } else {
        fired += 1;
      }
    }
    return { fired, late };
  }

  private async scheduleConstant(
    row: {
      reminderId: string | null;
      ownerId: string;
      taskId: string | null;
      channel: ReminderChannel;
      reminder: { constantIntervalMinutes: number | null; taskId: string } | null;
    },
    now: Date,
  ): Promise<void> {
    if (row.reminderId === null || row.taskId === null || row.reminder === null) {
      return;
    }
    const task = await this.prisma.task.findFirst({
      where: { id: row.taskId, status: 'active', deletedAt: null },
      select: { title: true },
    });
    if (task === null) {
      return;
    }
    const interval = row.reminder.constantIntervalMinutes ?? 15;
    const fireAt = nextConstantFire(now.toISOString(), interval);
    if (fireAt === null) {
      return;
    }
    await this.queue({
      ownerId: row.ownerId,
      reminderId: row.reminderId,
      taskId: row.taskId,
      dedupeKey: `reminder:${row.reminderId}:${fireAt}`,
      fireAt,
      channel: row.channel,
      kind: 'task',
      now,
      catchUp: false,
      payload: { title: task.title, body: `Recordatorio: ${task.title}` },
    });
  }

  private async copyChecklist(
    tx: Tx,
    ownerId: string,
    taskId: string,
    items: readonly {
      title: string;
      sortOrder: bigint;
      startDate: Date | null;
      dueDate: Date | null;
      isAllDay: boolean;
      timeZone: string;
    }[],
  ): Promise<void> {
    for (const item of items) {
      await tx.checklistItem.create({
        data: {
          ownerId,
          taskId,
          title: item.title,
          status: 'active',
          sortOrder: item.sortOrder,
          startDate: item.startDate,
          dueDate: item.dueDate,
          isAllDay: item.isAllDay,
          timeZone: item.timeZone,
        },
      });
    }
  }

  private async copyReminders(
    tx: Tx,
    ownerId: string,
    taskId: string,
    reminders: readonly {
      trigger: string;
      absoluteAt: Date | null;
      type: 'relative' | 'absolute' | 'location' | 'daily_digest';
      location: Prisma.JsonValue;
      channel: ReminderChannel;
      constant: boolean;
      constantIntervalMinutes: number | null;
    }[],
  ): Promise<void> {
    for (const reminder of reminders) {
      await tx.reminder.create({
        data: {
          ownerId,
          taskId,
          trigger: reminder.trigger,
          absoluteAt: reminder.absoluteAt,
          type: reminder.type,
          location: reminder.location === null ? Prisma.DbNull : asJson(reminder.location),
          channel: reminder.channel,
          constant: reminder.constant,
          constantIntervalMinutes: reminder.constantIntervalMinutes,
        },
      });
    }
  }

  private async copyTags(tx: Tx, taskId: string, tagIds: readonly string[]): Promise<void> {
    if (tagIds.length === 0) {
      return;
    }
    await tx.taskTag.createMany({
      data: tagIds.map((tagId) => ({ taskId, tagId })),
      skipDuplicates: true,
    });
  }
}

export function schedulerAutostart(): boolean {
  if (process.env.SCHEDULER_AUTOSTART === 'false') {
    return false;
  }
  if (process.env.SCHEDULER_AUTOSTART === 'true') {
    return true;
  }
  return process.env.NODE_ENV !== 'test';
}

function automation(ownerId: string): EventActor {
  return { ownerId, actorId: ownerId, actorKind: 'automation' };
}

function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function sameLocalDay(dueIso: string, fireIso: string, timeZone: string): boolean {
  const due = new Date(dueIso).toLocaleDateString('en-CA', { timeZone });
  const fire = new Date(fireIso).toLocaleDateString('en-CA', { timeZone });
  return due === fire;
}
