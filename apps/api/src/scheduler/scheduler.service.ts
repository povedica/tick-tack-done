import { randomUUID } from 'node:crypto';
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma, type ReminderChannel } from '@prisma/client';
import {
  calendarDate,
  countdownDaysLabel,
  deriveDurationMinutes,
  dueSignal,
  formatDailyDigest,
  instantFromWall,
  isAtDueTrigger,
  OVERDUE_GRACE_MS,
  nextConstantFire,
  nextDailyReminder,
  nextHabitReminder,
  nextOccurrence,
  readStoredHabit,
  streakBreakOn,
  REMINDER_HORIZON_MS,
  quietUntil,
  reminderDisposition,
  reminderFireAt,
  retryDelayMs,
  skipPastEnqueue,
} from '@reflexionia/domain';
import type { EventActor } from '../auth/auth-user.js';
import { DomainEvent } from '../events/domain-events.js';
import { EventRecorder } from '../events/event-recorder.js';
import { asJson } from '../http/json.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CalendarService } from '../modules/calendar/calendar.service.js';
import { DayClosingService } from '../modules/planning/day-closing.service.js';
import { GoogleSyncService } from '../modules/calendar/google-sync.service.js';
import type { Tx } from '../prisma/tx.js';
import { ReminderTransport } from './reminder.transport.js';

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
    @Inject(GoogleSyncService) private readonly googleSync: GoogleSyncService,
    @Inject(CalendarService) private readonly calendars: CalendarService,
    @Inject(DayClosingService) private readonly closing: DayClosingService,
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
    await this.enqueueShutdownDigests(now, catchUp);
    await this.enqueueHabitReminders(now, catchUp);
    await this.enqueueCountdownReminders(now, catchUp);
    await this.recordHabitStreakBreaks(now);
    await this.enqueueSignals(now, catchUp);
    await this.syncCalendars(now, catchUp);
    const fired = await this.fire(now, catchUp);
    return { materialized, fired: fired.fired, late: fired.late };
  }

  /** RF-2513. Isolated from reminder delivery: a calendar failure must not stop the tick. */
  private async syncCalendars(now: Date, catchUp: boolean): Promise<void> {
    try {
      await this.googleSync.syncDue(now, catchUp);
    } catch {
      // syncDue isolates each subscription; this only guards a listing failure.
    }
    try {
      await this.calendars.syncIcalDue(now, catchUp);
    } catch {
      // iCal rows record their own last_error.
    }
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
    const meta =
      typeof source.metadata === 'object' &&
      source.metadata !== null &&
      !Array.isArray(source.metadata)
        ? (source.metadata as Record<string, unknown>)
        : {};
    const advance = meta.series_advance === 'next_future' ? 'next_future' : 'one_period';
    const next = nextOccurrence({
      repeatRule,
      repeatFrom: source.repeatFrom,
      dueDate: anchorDue === null ? null : anchorDue.toISOString(),
      startDate: source.startDate === null ? null : source.startDate.toISOString(),
      completedAt: source.completedAt === null ? null : source.completedAt.toISOString(),
      timeZone: source.timeZone,
      isAllDay: source.isAllDay,
      occurrenceIndex: completedCount,
      advance,
      now: new Date().toISOString(),
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
      await this.prisma.$transaction(async (tx) => {
        await this.insertSuccessor(tx, source, { seriesId, repeatRule, due, start });
        if (meta.series_advance === 'next_future') {
          const cleared = { ...meta };
          delete cleared.series_advance;
          await tx.task.update({
            where: { id: source.id },
            data: { metadata: asJson(cleared) },
          });
        }
      });
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
        eveningOnly: false,
        isSomeday: source.isSomeday,
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
      const digest = formatDailyDigest({
        now: next.fireAt,
        fireAt: next.fireAt,
        tasks: tasks.flatMap((task) =>
          task.dueDate === null
            ? []
            : [
                {
                  title: task.title,
                  dueDate: task.dueDate.toISOString(),
                  isAllDay: task.isAllDay,
                  timeZone: task.timeZone,
                },
              ],
        ),
      });
      const loadLine = await this.closing.digestLine(user.id, next.fireAt, user.timeZone);
      const body = loadLine === null ? digest : `${digest}\n\n${loadLine}`;
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
          body,
          email: user.email,
        },
      });
    }
  }

  private async enqueueShutdownDigests(now: Date, catchUp: boolean): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, shutdownReminderTime: { not: null } },
      select: { id: true, email: true, timeZone: true, shutdownReminderTime: true },
    });
    for (const user of users) {
      if (user.shutdownReminderTime === null) {
        continue;
      }
      const next = nextDailyReminder({
        time: user.shutdownReminderTime,
        timeZone: user.timeZone,
        now: now.toISOString(),
      });
      if (!next.ok) {
        continue;
      }
      const reminder = await this.closing.shutdownReminder(user.id, user.timeZone, next.fireAt);
      if (reminder === null) {
        continue;
      }
      await this.queue({
        ownerId: user.id,
        reminderId: null,
        taskId: null,
        dedupeKey: `shutdown:${user.id}:${next.fireAt}`,
        fireAt: next.fireAt,
        channel: 'both',
        kind: 'shutdown_digest',
        now,
        catchUp,
        payload: {
          title: 'Cierra tu día',
          body: reminder.body,
          email: user.email,
          url: '/cierre',
        },
      });
    }
  }

  private async enqueueHabitReminders(now: Date, catchUp: boolean): Promise<void> {
    const habits = await this.prisma.habit.findMany({
      where: { deletedAt: null, archived: false, reminderTime: { not: null } },
      select: {
        id: true,
        ownerId: true,
        name: true,
        goal: true,
        frequency: true,
        reminderTime: true,
        owner: { select: { email: true, timeZone: true } },
      },
    });
    for (const habit of habits) {
      if (habit.reminderTime === null) {
        continue;
      }
      const stored = readStoredHabit(habit.goal, habit.frequency, habit.reminderTime);
      if (stored === null) {
        continue;
      }
      if (stored.reminderTime === null) {
        continue;
      }
      const next = nextHabitReminder({
        time: stored.reminderTime,
        days: stored.days,
        timeZone: habit.owner.timeZone,
        now: now.toISOString(),
      });
      if (!next.ok) {
        continue;
      }
      await this.queue({
        ownerId: habit.ownerId,
        reminderId: null,
        taskId: null,
        dedupeKey: `habit:${habit.id}:${next.fireAt}`,
        fireAt: next.fireAt,
        channel: 'push',
        kind: 'daily_digest',
        now,
        catchUp,
        payload: {
          title: habit.name,
          body: `Hábito: ${habit.name}`,
          email: habit.owner.email,
          habit_id: habit.id,
        },
      });
    }
  }

  private async enqueueCountdownReminders(now: Date, catchUp: boolean): Promise<void> {
    const countdowns = await this.prisma.countdown.findMany({
      where: { deletedAt: null, archivedAt: null },
      include: {
        reminders: true,
        owner: { select: { email: true, timeZone: true } },
      },
    });
    for (const countdown of countdowns) {
      const today = calendarDate(now.toISOString(), countdown.owner.timeZone);
      if (today === null) {
        continue;
      }
      const occurrence = countdownDaysLabel(
        {
          targetDate: countdown.targetDate.toISOString().slice(0, 10),
          repeatRule: countdown.repeatRule,
          dayMode: countdown.dayMode,
        },
        today,
        countdown.owner.timeZone,
      ).effectiveDate;

      for (const reminder of countdown.reminders) {
        if (reminder.constant) {
          await this.enqueueConstantCountdownReminder({
            countdown,
            reminder,
            occurrence,
            today,
            now,
            catchUp,
          });
          continue;
        }
        const reminderDate = shiftCalendarDate(occurrence, -reminder.offsetDays);
        await this.queueCountdownReminder({
          countdown,
          reminder,
          occurrence,
          fireDate: reminderDate,
          now,
          catchUp,
        });
      }

      if (occurrence === today) {
        const fireAt = atLocalNine(occurrence, countdown.owner.timeZone);
        if (fireAt !== null) {
          await this.queue({
            ownerId: countdown.ownerId,
            reminderId: null,
            taskId: null,
            countdownId: countdown.id,
            countdownReminderId: null,
            dedupeKey: `countdown:${countdown.id}:${occurrence}:reached`,
            fireAt,
            channel: 'both',
            kind: 'countdown',
            now,
            catchUp,
            payload: {
              countdown_id: countdown.id,
              occurrence_date: occurrence,
              reached: true,
              title: countdown.title,
            },
          });
        }
      }
    }
  }

  private async enqueueConstantCountdownReminder(input: {
    countdown: {
      id: string;
      ownerId: string;
      title: string;
      emoji: string | null;
      dayMode: 'standard' | 'plus_one';
      targetDate: Date;
      repeatRule: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
      owner: { email: string; timeZone: string };
    };
    reminder: { id: string };
    occurrence: string;
    today: string;
    now: Date;
    catchUp: boolean;
  }): Promise<void> {
    const start = shiftCalendarDate(input.occurrence, -3);
    const first = input.today > start ? input.today : start;
    for (let date = first; date <= input.occurrence; date = shiftCalendarDate(date, 1)) {
      await this.queueCountdownReminder({ ...input, fireDate: date, constantDate: date });
    }
  }

  private async queueCountdownReminder(input: {
    countdown: {
      id: string;
      ownerId: string;
      title: string;
      emoji: string | null;
      dayMode: 'standard' | 'plus_one';
      targetDate: Date;
      repeatRule: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
      owner: { email: string; timeZone: string };
    };
    reminder: { id: string; offsetDays?: number };
    occurrence: string;
    fireDate: string;
    constantDate?: string;
    now: Date;
    catchUp: boolean;
  }): Promise<void> {
    const fireAt = atLocalNine(input.fireDate, input.countdown.owner.timeZone);
    const today = calendarDate(input.now.toISOString(), input.countdown.owner.timeZone);
    if (fireAt === null || today === null || input.fireDate < today) {
      return;
    }
    const label = countdownDaysLabel(
      {
        targetDate: input.countdown.targetDate.toISOString().slice(0, 10),
        repeatRule: input.countdown.repeatRule,
        dayMode: input.countdown.dayMode,
      },
      input.fireDate,
      input.countdown.owner.timeZone,
    );
    const prefix = input.countdown.emoji === null ? '⏳' : `⏳ ${input.countdown.emoji}`;
    const body =
      label.kind === 'today'
        ? `${prefix} ${input.countdown.title}: ¡es hoy!`
        : `${prefix} ${input.countdown.title}: quedan ${String(label.days)} días`;
    const offset = input.reminder.offsetDays ?? 3;
    await this.queue({
      ownerId: input.countdown.ownerId,
      reminderId: null,
      taskId: null,
      countdownId: input.countdown.id,
      countdownReminderId: input.reminder.id,
      dedupeKey: `countdown:${input.countdown.id}:${input.occurrence}:${String(input.constantDate ?? offset)}`,
      fireAt,
      channel: 'both',
      kind: 'countdown',
      now: input.now,
      catchUp: input.catchUp,
      payload: {
        countdown_id: input.countdown.id,
        occurrence_date: input.occurrence,
        offset_days: offset,
        title: `${prefix} ${input.countdown.title}`,
        body,
        email: input.countdown.owner.email,
      },
    });
  }

  private async recordHabitStreakBreaks(now: Date): Promise<void> {
    const habits = await this.prisma.habit.findMany({
      where: { deletedAt: null, archived: false },
      select: {
        id: true,
        ownerId: true,
        name: true,
        goal: true,
        frequency: true,
        reminderTime: true,
        logs: { where: { deletedAt: null }, select: { date: true, count: true } },
        owner: { select: { timeZone: true } },
      },
    });
    for (const habit of habits) {
      const stored = readStoredHabit(habit.goal, habit.frequency, habit.reminderTime);
      if (stored === null) {
        continue;
      }
      const broken = streakBreakOn({
        goal: stored.goal,
        days: stored.days,
        logs: habit.logs.map((log) => ({
          date: log.date.toISOString().slice(0, 10),
          count: log.count,
        })),
        timeZone: habit.owner.timeZone,
        now: now.toISOString(),
      });
      if (broken === null) {
        continue;
      }
      const existing = await this.prisma.outboxEvent.findFirst({
        where: {
          ownerId: habit.ownerId,
          type: DomainEvent.habitStreakBroken,
          AND: [
            { data: { path: ['habit_id'], equals: habit.id } },
            { data: { path: ['date'], equals: broken } },
          ],
        },
        select: { id: true },
      });
      if (existing !== null) {
        continue;
      }
      await this.prisma.$transaction(async (tx) => {
        await this.events.record(tx, automation(habit.ownerId), {
          type: DomainEvent.habitStreakBroken,
          entityType: 'habit',
          entityId: habit.id,
          action: 'updated',
          data: asJson({ habit_id: habit.id, date: broken, name: habit.name }),
          previous: null,
        });
      });
    }
  }

  private async enqueueSignals(now: Date, catchUp: boolean): Promise<void> {
    const horizon = new Date(now.getTime() + DUE_SOON_MS);
    const grace = new Date(now.getTime() - (catchUp ? REMINDER_HORIZON_MS : OVERDUE_GRACE_MS));
    const tasks = await this.prisma.task.findMany({
      where: {
        status: 'active',
        deletedAt: null,
        isAllDay: false,
        dueDate: { not: null, lte: horizon, gte: grace },
      },
      select: {
        id: true,
        ownerId: true,
        title: true,
        dueDate: true,
        isAllDay: true,
        timeZone: true,
        reminders: { where: { deletedAt: null }, select: { trigger: true } },
      },
    });
    for (const task of tasks) {
      if (task.dueDate === null) {
        continue;
      }
      const due = task.dueDate.toISOString();
      const kind = dueSignal({
        due,
        now: now.toISOString(),
        isAllDay: task.isAllDay,
        catchUp,
      });
      if (kind === 'skip') {
        continue;
      }
      if (kind === 'due_soon' && task.reminders.some((item) => isAtDueTrigger(item.trigger))) {
        continue;
      }
      await this.queue({
        ownerId: task.ownerId,
        reminderId: null,
        taskId: task.id,
        dedupeKey: `${kind}:${task.id}:${due}`,
        fireAt: kind === 'overdue' && !catchUp ? now.toISOString() : due,
        channel: 'push',
        kind,
        now,
        catchUp: kind === 'overdue' && catchUp,
        payload: { title: task.title, due, time_zone: task.timeZone },
      });
    }
  }

  private async queue(input: {
    ownerId: string;
    reminderId: string | null;
    taskId: string | null;
    countdownId?: string | null;
    countdownReminderId?: string | null;
    dedupeKey: string;
    fireAt: string;
    channel: ReminderChannel;
    kind: 'task' | 'daily_digest' | 'shutdown_digest' | 'overdue' | 'due_soon' | 'countdown';
    now: Date;
    catchUp: boolean;
    payload: Prisma.InputJsonObject;
  }): Promise<void> {
    const at = Date.parse(input.fireAt);
    if (Number.isNaN(at)) {
      return;
    }
    if (
      input.kind === 'task' &&
      !input.catchUp &&
      skipPastEnqueue(input.fireAt, input.now.toISOString())
    ) {
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
        countdownId: input.countdownId ?? null,
        countdownReminderId: input.countdownReminderId ?? null,
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
    const workerId = `scheduler-${process.pid}`;
    const due = await this.prisma.reminderDelivery.findMany({
      where: {
        AND: [
          { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
          {
            OR: [
              { status: 'scheduled', fireAt: { lte: now } },
              { status: 'failed', nextRetryAt: { lte: now }, attempts: { lt: 3 } },
            ],
          },
        ],
      },
      include: {
        owner: {
          select: {
            email: true,
            timeZone: true,
            quietHoursStart: true,
            quietHoursEnd: true,
            telegramEnabled: true,
            pushSubscriptions: { where: { deletedAt: null } },
            telegramLinks: { where: { deletedAt: null }, select: { chatId: true }, take: 1 },
          },
        },
        reminder: { select: { constant: true, constantIntervalMinutes: true, taskId: true } },
        countdown: { select: { id: true } },
      },
      take: 50,
    });
    let fired = 0;
    let late = 0;
    for (const row of due) {
      const claimed = await this.prisma.reminderDelivery.updateMany({
        where: {
          id: row.id,
          status: row.status,
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        data: {
          leaseOwner: workerId,
          leaseUntil: new Date(now.getTime() + 60_000),
          fenceGeneration: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        continue;
      }
      const payload = asRecord(row.payload);
      if (row.kind === 'countdown') {
        const mark = catchUp && row.fireAt.getTime() < now.getTime() ? 'late' : 'fired';
        const reached = payload.reached === true;
        const result = reached
          ? {
              email: 'skipped' as const,
              push: 'skipped' as const,
              telegram: 'skipped' as const,
              telegram_message_id: null,
              retry_after_seconds: null,
            }
          : await this.transport.deliver({
              channel: row.channel,
              email: typeof payload.email === 'string' ? payload.email : row.owner.email,
              subscriptions: row.owner.pushSubscriptions,
              telegramChatId: row.owner.telegramLinks[0]?.chatId ?? null,
              allowTelegram: row.owner.telegramEnabled,
              title: typeof payload.title === 'string' ? payload.title : 'Recordatorio',
              body: typeof payload.body === 'string' ? payload.body : '',
            });
        await this.prisma.$transaction(async (tx) => {
          await tx.reminderDelivery.update({
            where: { id: row.id },
            data: {
              status: mark,
              firedAt: now,
              payload: asJson({ ...payload, delivery: result }),
              telegramMessageId:
                result.telegram_message_id === null ? null : String(result.telegram_message_id),
              channelState: asJson(result),
              reconcileRequired: result.telegram === 'unknown',
              leaseUntil: null,
            },
          });
          if (row.countdownId !== null) {
            await this.events.record(tx, automation(row.ownerId), {
              type: reached ? DomainEvent.countdownReached : DomainEvent.countdownReminderDue,
              entityType: 'countdown',
              entityId: row.countdownId,
              action: 'updated',
              data: asJson({
                countdown_id: row.countdownId,
                occurrence_date: payload.occurrence_date,
                delivery_id: row.id,
                status: mark,
                ...(reached ? {} : { offset_days: payload.offset_days }),
              }),
              previous: null,
            });
          }
        });
        if (mark === 'late') {
          late += 1;
        } else {
          fired += 1;
        }
        continue;
      }
      if (await this.deliveryStale(row.taskId, payload)) {
        await this.prisma.reminderDelivery.update({
          where: { id: row.id },
          data: { status: 'cancelled', firedAt: now },
        });
        continue;
      }
      const resume = quietUntil(
        now.toISOString(),
        row.owner.timeZone,
        row.owner.quietHoursStart,
        row.owner.quietHoursEnd,
      );
      if (resume !== null) {
        await this.prisma.reminderDelivery.update({
          where: { id: row.id },
          data: { status: 'scheduled', fireAt: new Date(resume) },
        });
        continue;
      }
      const notice = noticeCopy(row.kind, payload, now);
      const result = await this.transport.deliver({
        channel: row.channel,
        email: typeof payload.email === 'string' ? payload.email : row.owner.email,
        subscriptions: row.owner.pushSubscriptions,
        telegramChatId: row.owner.telegramLinks[0]?.chatId ?? null,
        allowTelegram: row.owner.telegramEnabled,
        title: notice.title,
        body: notice.body,
        ...(row.taskId === null
          ? {}
          : {
              buttons: [
                [
                  { text: '✅ Hecho', callback_data: `c:${row.taskId}` },
                  { text: '😴 +10 min', callback_data: `s:${row.id}:10` },
                  { text: '😴 +1 h', callback_data: `s:${row.id}:60` },
                ],
                [{ text: '😴 Esta tarde', callback_data: `s:${row.id}:afternoon` }],
              ],
            }),
      });
      if (result.telegram === 'unknown' || result.telegram === 'disconnected') {
        await this.prisma.reminderDelivery.update({
          where: { id: row.id },
          data: {
            status: result.telegram === 'disconnected' ? 'failed' : 'fired',
            firedAt: now,
            attempts: row.attempts + 1,
            nextRetryAt: null,
            payload: asJson({ ...payload, delivery: result }),
            channelState: asJson(result),
            reconcileRequired: result.telegram === 'unknown',
            leaseUntil: null,
          },
        });
        continue;
      }
      if (result.telegram === 'failed' || result.telegram === 'rate_limited') {
        const attempts = row.attempts + 1;
        const delay =
          result.retry_after_seconds !== null
            ? result.retry_after_seconds * 1000
            : retryDelayMs(attempts);
        await this.prisma.reminderDelivery.update({
          where: { id: row.id },
          data: {
            status: 'failed',
            attempts,
            nextRetryAt: delay === null ? null : new Date(now.getTime() + delay),
            payload: asJson({ ...payload, delivery: result }),
            channelState: asJson(result),
            leaseUntil: null,
          },
        });
        continue;
      }
      const mark = catchUp && row.fireAt.getTime() < now.getTime() ? 'late' : 'fired';
      await this.prisma.$transaction(async (tx) => {
        await tx.reminderDelivery.update({
          where: { id: row.id },
          data: {
            status: mark,
            firedAt: now,
            payload: asJson({ ...payload, delivery: result }),
            telegramMessageId:
              result.telegram_message_id === null ? null : String(result.telegram_message_id),
            channelState: asJson(result),
            leaseUntil: null,
          },
        });
        const habitId = typeof payload.habit_id === 'string' ? payload.habit_id : null;
        const signal = row.kind === 'overdue' || row.kind === 'due_soon';
        await this.events.record(tx, automation(row.ownerId), {
          type: signal
            ? row.kind === 'overdue'
              ? DomainEvent.taskOverdue
              : DomainEvent.taskDueSoon
            : DomainEvent.reminderFired,
          entityType: habitId === null ? (signal ? 'task' : 'reminder') : 'habit',
          entityId: habitId ?? (signal ? row.taskId : row.reminderId) ?? row.id,
          action: 'updated',
          data: asJson({
            delivery_id: row.id,
            kind: habitId === null ? row.kind : 'habit',
            status: mark,
            task_id: row.taskId,
            ...(habitId === null ? {} : { habit_id: habitId }),
          }),
          previous: null,
        });
      });
      if (row.kind === 'task' && row.reminder?.constant === true && row.taskId !== null) {
        await this.scheduleConstant(row, now);
      }
      if (mark === 'late') {
        late += 1;
      } else {
        fired += 1;
      }
    }
    return { fired, late };
  }

  private async deliveryStale(
    taskId: string | null,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    if (taskId === null) {
      return false;
    }
    const task = await this.prisma.task.findFirst({
      where: { id: taskId },
      select: { status: true, deletedAt: true, dueDate: true },
    });
    if (task?.deletedAt !== null || task.status !== 'active') {
      return true;
    }
    const due = typeof payload.due === 'string' ? payload.due : null;
    return due !== null && task.dueDate?.toISOString() !== due;
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

function noticeCopy(
  kind: string,
  payload: Record<string, unknown>,
  now: Date,
): { title: string; body: string } {
  const rawTitle = typeof payload.title === 'string' ? payload.title : 'Recordatorio';
  const rawBody = typeof payload.body === 'string' ? payload.body : '';
  if (kind !== 'due_soon' && kind !== 'overdue') {
    return { title: rawTitle, body: rawBody };
  }
  const due = typeof payload.due === 'string' ? payload.due : now.toISOString();
  const zone = typeof payload.time_zone === 'string' ? payload.time_zone : 'UTC';
  const clock = new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: zone,
  }).format(new Date(due));
  if (kind === 'overdue') {
    return { title: `⚠️ Vencida: ${rawTitle}`, body: `Venció a las ${clock}` };
  }
  return { title: `⏰ ${rawTitle}`, body: `Vence ahora (${clock})` };
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
  return { ownerId, actorId: ownerId, actorKind: 'automation', tokenId: null };
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
function atLocalNine(date: string, timeZone: string): string | null {
  const [year, month, day] = date.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return null;
  }
  return instantFromWall({ year, month, day, hour: 9, minute: 0, second: 0 }, timeZone);
}

function shiftCalendarDate(date: string, amount: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
