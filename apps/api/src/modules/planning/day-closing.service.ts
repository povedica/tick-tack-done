import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type PlanDecision, type PlanSession } from '@prisma/client';
import {
  civilDateKey,
  dayLoad,
  featureEnabled,
  formatDayLoadLine,
  instantFromWall,
  proposeReplan,
  shiftCivilDate,
  type DayLoadResult,
  type DayOccupancy,
  type PlanDecisionKind,
  type ReplanCandidate,
} from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { DomainException } from '../../http/domain.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TasksService } from '../tasks/tasks.service.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

interface ClosingTask {
  readonly id: string;
  readonly title: string;
  readonly projectId: string;
  readonly priority: 'none' | 'low' | 'medium' | 'high';
  readonly dueDate: Date | null;
  readonly startDate: Date | null;
  readonly isAllDay: boolean;
  readonly eveningOnly: boolean;
  readonly isSomeday: boolean;
  readonly durationMinutes: number | null;
  readonly timeZone: string;
  readonly status: string;
  readonly parentId: string | null;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
  readonly project: { readonly name: string };
}

type SessionRow = PlanSession & {
  readonly plan: { readonly id: string; readonly localDate: string; readonly timeZone: string };
  readonly decisions: readonly PlanDecision[];
};

interface AppliedEffect {
  readonly task_id: string;
  readonly decision: string;
  readonly effect: string;
}

@Injectable()
export class DayClosingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TasksService) private readonly tasks: TasksService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  async load(user: AuthUser, date: string, timeZone: string): Promise<Record<string, unknown>> {
    this.assertDate(date);
    timeZone = user.timeZone;
    this.assertZone(timeZone);
    const profile = await this.profile(user.id);
    const result = await this.compute(user.id, date, timeZone, profile);
    return {
      date,
      task_minutes: result.taskMinutes,
      event_minutes: result.eventMinutes,
      available_minutes: result.availableMinutes,
      unestimated_count: result.unestimatedCount,
      unestimated_task_ids: result.unestimatedTaskIds,
      ratio: result.ratio,
      status: result.status,
    };
  }

  async configureWorkDays(user: AuthUser, workDays: readonly number[]) {
    if (workDays.length > 7 || !workDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'Invalid work days');
    await this.prisma.$transaction(async (tx) => {
      await tx.viewPreference.upsert({
        where: { ownerId_key: { ownerId: user.id, key: 'planning' } },
        create: { ownerId: user.id, key: 'planning', preferences: { work_days: [...workDays] } },
        update: { preferences: { work_days: [...workDays] } },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.viewPreferenceUpdated,
        entityType: 'view_preference',
        entityId: user.id,
        action: 'updated',
        data: { key: 'planning', work_days: [...workDays] },
        previous: null,
      });
    });
    return { work_days: workDays };
  }

  async range(user: AuthUser, from: string, days: number): Promise<Record<string, unknown>> {
    this.assertDate(from);
    if (!Number.isInteger(days) || days < 1 || days > 14)
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'days must be between 1 and 14',
      );
    const timeZone = user.timeZone;
    const profile = await this.profile(user.id);
    const result = [];
    for (let i = 0; i < days; i += 1) {
      const date = shiftCivilDate(from, i);
      const tasks = (await this.queue(user.id, date, timeZone)).filter(
        (t) => user.listIds === null || user.listIds.includes(t.projectId),
      );
      const events = await this.eventsOn(user.id, date, timeZone);
      const load = dayLoad({
        date,
        timeZone,
        settings: profile,
        tasks: tasks.map((t) => ({
          ...t,
          startDate: t.startDate?.toISOString() ?? null,
          dueDate: t.dueDate?.toISOString() ?? null,
        })),
        events,
      });
      result.push({
        ...this.loadJson(date, load),
        unestimated_count: load.unestimatedCount,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          start_date: t.startDate?.toISOString() ?? null,
          due_date: t.dueDate?.toISOString() ?? null,
          is_all_day: t.isAllDay,
          duration_minutes: t.durationMinutes,
          evening_only: t.eveningOnly,
        })),
        events: events.map((e) => ({
          id: e.id,
          title: e.title,
          starts_at: e.startsAt,
          ends_at: e.endsAt,
          is_all_day: e.isAllDay,
        })),
      });
    }
    return {
      time_zone: timeZone,
      settings: {
        work_day_start: profile.workDayStart,
        work_day_end: profile.workDayEnd,
        default_task_duration: profile.defaultTaskDuration,
        evening_start: profile.eveningStart,
        work_days: profile.workDays,
      },
      days: result,
    };
  }

  async startShutdown(
    user: AuthUser,
    localDate: string,
    timeZone: string,
  ): Promise<Record<string, unknown>> {
    return this.open(user, 'shutdown', localDate, timeZone, true);
  }

  async startReplan(
    user: AuthUser,
    localDate: string,
    timeZone: string,
    applySuggestions = true,
  ): Promise<Record<string, unknown>> {
    return this.open(user, 'replan', localDate, timeZone, false, applySuggestions);
  }

  async decide(
    user: AuthUser,
    sessionId: string,
    taskId: string,
    decision: PlanDecisionKind,
    targetDate: string | null,
    evening: boolean,
  ): Promise<Record<string, unknown>> {
    const session = await this.requireOpen(user.id, sessionId);
    const queue = await this.queue(
      user.id,
      session.plan.localDate,
      session.plan.timeZone,
      session.kind === 'replan',
    );
    if (!queue.some((task) => task.id === taskId)) {
      // Explicit choices may still adjust a task scheduled on this day. Automatic
      // replan suggestions remain restricted to overdue tasks.
      const explicit = await this.prisma.task.findFirst({
        where: {
          id: taskId,
          ownerId: user.id,
          deletedAt: null,
          status: 'active',
          kind: 'task',
          parentId: null,
          isSomeday: false,
        },
      });
      if (
        session.kind !== 'replan' ||
        explicit === null ||
        !this.onDay(explicit, session.plan.localDate, session.plan.timeZone)
      )
        throw new DomainException(
          HttpStatus.NOT_FOUND,
          'task_not_in_plan',
          'Task is not in this plan',
        );
    }
    const target = this.targetFor(session.plan.localDate, decision, targetDate);
    await this.prisma.planDecision.upsert({
      where: { sessionId_taskId: { sessionId, taskId } },
      create: { sessionId, taskId, decision, targetDate: target, evening },
      update: { decision, targetDate: target, evening },
    });
    return this.view(await this.bump(sessionId), user.id);
  }

  async clear(user: AuthUser, sessionId: string, taskId: string): Promise<Record<string, unknown>> {
    await this.requireOpen(user.id, sessionId);
    await this.prisma.planDecision.deleteMany({ where: { sessionId, taskId } });
    return this.view(await this.bump(sessionId), user.id);
  }

  async apply(
    user: AuthUser,
    sessionId: string,
    expectedRevision: number,
    key: string | undefined,
  ): Promise<Record<string, unknown>> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
        return this.applyLocked(user, sessionId, expectedRevision, key);
      },
      { timeout: 60_000 },
    );
  }

  private async applyLocked(
    user: AuthUser,
    sessionId: string,
    expectedRevision: number,
    key: string | undefined,
  ): Promise<Record<string, unknown>> {
    if (key === undefined || key.trim() === '') {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'idempotency_key_required',
        'Idempotency-Key is required',
      );
    }
    const session = await this.owned(user.id, sessionId);
    const operation = await this.begin(user.id, session, key.trim(), expectedRevision);
    if (operation.status === 'applied') {
      return this.appliedBody(operation.result, true);
    }
    const stored = readApplied(operation.result);
    const done = new Set(stored.map((item) => item.task_id));
    const pending = session.decisions.filter(
      (decision) => decision.decision !== 'skip' && !done.has(decision.taskId),
    );
    const snapshot = session.snapshot as { cards?: { taskId: string; updatedAt: string }[] };
    const current = await this.prisma.task.findMany({
      where: { ownerId: user.id, id: { in: pending.map((item) => item.taskId) } },
      select: { id: true, updatedAt: true, status: true, deletedAt: true },
    });
    if (
      pending.some((item) => {
        const task = current.find((task) => task.id === item.taskId);
        const card = snapshot.cards?.find((card) => card.taskId === item.taskId);
        return (
          task?.status !== 'active' ||
          task.deletedAt !== null ||
          (card?.updatedAt !== undefined && task.updatedAt.toISOString() !== card.updatedAt)
        );
      })
    )
      throw new DomainException(
        HttpStatus.CONFLICT,
        'plan_conflict',
        'A task changed since the preview',
      );
    await this.prisma.planSession.update({
      where: { id: session.id },
      data: { state: 'applying' },
    });
    const applied = [...stored];
    for (const decision of pending) {
      const effect = await this.applyOne(
        user,
        session,
        decision,
        `${key.trim()}:${decision.taskId}`,
      );
      applied.push({ task_id: decision.taskId, decision: decision.decision, effect });
      await this.prisma.planOperation.update({
        where: { id: operation.id },
        data: { result: asJson({ applied }) },
      });
    }
    const counts = countDecisions(applied);
    await this.prisma.planOperation.update({
      where: { id: operation.id },
      data: { status: 'applied', result: asJson({ applied, counts }) },
    });
    await this.prisma.planSession.update({
      where: { id: session.id },
      data: {
        state: 'applied',
        snapshot: asJson({ applied, counts, closed: true }),
      },
    });
    const event =
      session.kind === 'replan' ? DomainEvent.planReplanApplied : DomainEvent.planShutdownApplied;
    await this.prisma.$transaction((tx) =>
      this.events.record(tx, actorOf(user), {
        type: event,
        entityType: 'plan_session',
        entityId: session.id,
        action: 'updated',
        data: asJson({ session_id: session.id, ...counts }),
        previous: null,
      }),
    );
    return this.appliedBody(asJson({ applied, counts }), false);
  }

  async replanTool(
    user: AuthUser,
    date: string | undefined,
    autoApply: boolean,
    overrides: readonly {
      readonly task_id: string;
      readonly decision: PlanDecisionKind;
      readonly target_date?: string | null;
    }[],
    key: string | undefined,
  ): Promise<Record<string, unknown>> {
    const zone = user.timeZone;
    const today = civilDateKey(new Date().toISOString(), zone) ?? '';
    const local = date ?? today;
    this.assertDate(local);
    if (local > today)
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'replan solo para hoy o días pasados',
      );
    if ((await this.queue(user.id, local, zone, true)).length === 0)
      return { session: null, reason: 'nothing_to_replan' };
    const session = await this.startReplan(user, local, zone);
    const id = String(session.id);
    const revision = Number(session.revision);
    for (const override of overrides) {
      await this.decide(
        user,
        id,
        override.task_id,
        override.decision,
        override.target_date ?? null,
        false,
      );
    }
    if (!autoApply) {
      return { ...(await this.view(await this.owned(user.id, id), user.id)), auto_applied: false };
    }
    const current = await this.owned(user.id, id);
    return {
      ...(await this.apply(user, id, current.revision, key ?? `replan:${id}:${String(revision)}`)),
      auto_applied: true,
    };
  }

  async discardReplan(user: AuthUser, id: string): Promise<{ discarded: true }> {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.planSession.findFirst({
        where: { id, ownerId: user.id, kind: 'replan' },
      });
      if (session === null)
        throw new DomainException(
          HttpStatus.NOT_FOUND,
          'session_not_found',
          'Replan session was not found',
        );
      if (session.state !== 'draft')
        throw new DomainException(
          HttpStatus.CONFLICT,
          'session_closed',
          'Only a draft can be discarded',
        );
      const changed = await tx.planSession.updateMany({
        where: { id, ownerId: user.id, state: 'draft', revision: session.revision },
        data: { state: 'discarded', revision: { increment: 1 } },
      });
      if (changed.count !== 1)
        throw new DomainException(
          HttpStatus.CONFLICT,
          'session_changed',
          'Session changed concurrently',
        );
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.planReplanDiscarded,
        entityType: 'plan_session',
        entityId: id,
        action: 'updated',
        data: { session_id: id, state: 'discarded' },
        previous: { state: 'draft' },
      });
      return { discarded: true };
    });
  }

  private async open(
    user: AuthUser,
    kind: 'shutdown' | 'replan',
    localDate: string,
    timeZone: string,
    restrictDate: boolean,
    applySuggestions = true,
  ): Promise<Record<string, unknown>> {
    this.assertDate(localDate);
    this.assertZone(timeZone);
    if (restrictDate) {
      const today = civilDateKey(new Date().toISOString(), timeZone);
      const yesterday = today === null ? null : shiftCivilDate(today, -1);
      if (localDate !== today && localDate !== yesterday) {
        throw new DomainException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'validation_failed',
          'local_date must be today or yesterday',
        );
      }
    }
    const queue = await this.queue(user.id, localDate, timeZone, kind === 'replan');
    const profile = await this.profile(user.id);
    const suggestions =
      kind === 'replan'
        ? proposeReplan({
            today: localDate,
            timeZone,
            settings: {
              workDayStart: profile.workDayStart,
              workDayEnd: profile.workDayEnd,
              defaultTaskDuration: profile.defaultTaskDuration,
            },
            candidates: queue.map((task) => this.candidate(task)),
            occupancy: await this.occupancy(user.id, localDate, timeZone, queue),
          })
        : [];
    const plan = await this.prisma.dayPlan.upsert({
      where: {
        ownerId_localDate_timeZone: { ownerId: user.id, localDate, timeZone },
      },
      create: { ownerId: user.id, localDate, timeZone },
      update: {},
    });
    const todayLoad = await this.compute(user.id, localDate, timeZone, profile);
    const tomorrow = shiftCivilDate(localDate, 1);
    const tomorrowLoad = await this.compute(user.id, tomorrow, timeZone, profile);
    const session = await this.prisma.planSession.create({
      data: {
        planId: plan.id,
        ownerId: user.id,
        kind,
        sources: asJson({ kind }),
        snapshot: asJson({
          cards: queue.map((task) => ({
            taskId: task.id,
            title: task.title,
            updatedAt: task.updatedAt.toISOString(),
          })),
        }),
      },
      include: { decisions: true, plan: true },
    });
    if (kind === 'replan' && applySuggestions) {
      for (const suggestion of suggestions) {
        if (suggestion.decision === 'skip') {
          continue;
        }
        await this.prisma.planDecision.create({
          data: {
            sessionId: session.id,
            taskId: suggestion.taskId,
            decision: suggestion.decision,
            targetDate: suggestion.targetDate,
          },
        });
      }
    }
    await this.prisma.planSession.updateMany({
      where: { ownerId: user.id, planId: plan.id, state: 'draft', kind, id: { not: session.id } },
      data: { state: 'discarded' },
    });
    if (kind === 'shutdown') {
      await this.prisma.$transaction((tx) =>
        this.events.record(tx, actorOf(user), {
          type: DomainEvent.planShutdownStarted,
          entityType: 'plan_session',
          entityId: session.id,
          action: 'created',
          data: { session_id: session.id, local_date: localDate, pending: queue.length },
          previous: null,
        }),
      );
    }
    const fresh = await this.owned(user.id, session.id);
    const body = await this.view(fresh, user.id);
    return {
      ...body,
      suggestions,
      load: {
        today: this.loadJson(localDate, todayLoad),
        tomorrow: this.loadJson(tomorrow, tomorrowLoad),
      },
      review: await this.review(user.id, localDate, timeZone),
      queue: {
        cards: queue.map((task) => {
          const suggestion = suggestions.find((item) => item.taskId === task.id);
          const deadline =
            task.dueDate === null ? null : civilDateKey(task.dueDate.toISOString(), task.timeZone);
          return {
            task_id: task.id,
            title: task.title,
            priority: task.priority,
            deadline,
            project_name: task.project.name,
            suggested: suggestion
              ? {
                  decision: suggestion.decision,
                  target_date: suggestion.targetDate,
                  reason: suggestion.reason,
                }
              : null,
            over_deadline: this.overDeadline(task, suggestion?.targetDate ?? null, timeZone),
          };
        }),
      },
    };
  }

  private async applyOne(
    user: AuthUser,
    session: SessionRow,
    decision: PlanDecision,
    key: string,
  ): Promise<string> {
    const current = await this.prisma.task.findFirst({
      where: { id: decision.taskId, ownerId: user.id, deletedAt: null, status: 'active' },
    });
    if (current === null) return 'unchanged';
    if (decision.decision === 'done') {
      await this.tasks.complete(user, decision.taskId, { complete_children: 'complete' }, key);
      return 'completed';
    }
    if (decision.decision === 'cancel') {
      await this.tasks.cancel(user, decision.taskId);
      return 'cancelled';
    }
    if (decision.decision === 'trash') {
      const row = await this.prisma.task.findFirst({
        where: { id: decision.taskId, ownerId: user.id },
        select: { deletedAt: true },
      });
      if (row?.deletedAt === null) {
        await this.tasks.remove(user, decision.taskId);
      }
      return 'trashed';
    }
    if (decision.decision === 'someday') {
      if (current.isSomeday && current.startDate === null) return 'unchanged';
      await this.prisma.task.update({
        where: { id: decision.taskId },
        data: { isSomeday: true, startDate: null },
      });
      await this.recordSomeday(user, decision.taskId, true);
      return 'someday';
    }
    if (decision.decision === 'plan_day' || decision.decision === 'later') {
      const target = decision.targetDate ?? shiftCivilDate(session.plan.localDate, 1);
      const start = this.wallStart(target, session.plan.timeZone);
      if (start === null)
        throw new DomainException(
          HttpStatus.BAD_REQUEST,
          'validation_failed',
          'Invalid target date',
        );
      const membership = await this.prisma.planMember.findUnique({
        where: { planId_taskId: { planId: session.planId, taskId: decision.taskId } },
      });
      if (
        membership === null &&
        current.startDate?.getTime() === start.getTime() &&
        !current.isSomeday &&
        (!decision.evening || current.eveningOnly)
      )
        return 'unchanged';
      await this.prisma.planMember.deleteMany({
        where: { taskId: decision.taskId, planId: session.planId },
      });
      await this.prisma.task.update({
        where: { id: decision.taskId },
        data: {
          startDate: start,
          isSomeday: false,
          ...(decision.evening ? { eveningOnly: true } : {}),
        },
      });
      if (target === shiftCivilDate(session.plan.localDate, 1)) {
        const plan = await this.prisma.dayPlan.upsert({
          where: {
            ownerId_localDate_timeZone: {
              ownerId: user.id,
              localDate: target,
              timeZone: session.plan.timeZone,
            },
          },
          create: { ownerId: user.id, localDate: target, timeZone: session.plan.timeZone },
          update: {},
        });
        await this.prisma.planMember.upsert({
          where: { planId_taskId: { planId: plan.id, taskId: decision.taskId } },
          create: { planId: plan.id, taskId: decision.taskId, rank: 0, source: session.kind },
          update: { source: session.kind },
        });
      }
      return decision.decision === 'plan_day' ? 'planned' : 'later';
    }
    return 'skipped';
  }

  private async queue(
    ownerId: string,
    localDate: string,
    timeZone: string,
    includeOverdue = false,
  ): Promise<ClosingTask[]> {
    const rows = await this.prisma.task.findMany({
      where: {
        ownerId,
        deletedAt: null,
        status: 'active',
        kind: 'task',
        parentId: null,
        isSomeday: false,
      },
      include: { project: { select: { name: true } } },
    });
    if (includeOverdue) {
      const today = civilDateKey(new Date().toISOString(), timeZone) ?? '';
      const cutoff = this.wallStart(today, timeZone);
      return rows.filter((row) => row.dueDate !== null && cutoff !== null && row.dueDate < cutoff);
    }
    const memberIds = new Set(await this.memberIds(ownerId, localDate, timeZone));
    const today = civilDateKey(new Date().toISOString(), timeZone);
    return rows.filter(
      (row) =>
        memberIds.has(row.id) ||
        this.onDay(row, localDate, timeZone) ||
        (localDate === today &&
          row.dueDate !== null &&
          (civilDateKey(row.dueDate.toISOString(), timeZone) ?? '') < localDate &&
          (row.startDate === null ||
            (civilDateKey(row.startDate.toISOString(), timeZone) ?? '') <= localDate)),
    );
  }

  private onDay(
    task: { startDate: Date | null; dueDate: Date | null; timeZone: string },
    localDate: string,
    timeZone: string,
  ): boolean {
    const zone = task.timeZone.length > 0 ? task.timeZone : timeZone;
    const when = task.startDate === null ? null : civilDateKey(task.startDate.toISOString(), zone);
    const due = task.dueDate === null ? null : civilDateKey(task.dueDate.toISOString(), zone);
    const start = when ?? due;
    if (start === null) {
      return false;
    }
    const end = due !== null && due >= start ? due : start;
    return start <= localDate && localDate <= end;
  }

  private async memberIds(ownerId: string, localDate: string, timeZone: string): Promise<string[]> {
    const plan = await this.prisma.dayPlan.findUnique({
      where: { ownerId_localDate_timeZone: { ownerId, localDate, timeZone } },
      select: { members: { select: { taskId: true } } },
    });
    return plan?.members.map((member) => member.taskId) ?? [];
  }

  private async compute(
    ownerId: string,
    date: string,
    timeZone: string,
    profile: {
      workDayStart: string | null;
      workDayEnd: string | null;
      defaultTaskDuration: number;
    },
  ): Promise<DayLoadResult> {
    const tasks = await this.queue(ownerId, date, timeZone);
    const events = await this.eventsOn(ownerId, date, timeZone);
    return dayLoad({
      date,
      timeZone,
      settings: profile,
      tasks: tasks.map((task) => ({
        id: task.id,
        durationMinutes: task.durationMinutes,
        startDate: task.startDate?.toISOString() ?? null,
        dueDate: task.dueDate?.toISOString() ?? null,
        isAllDay: task.isAllDay,
        eveningOnly: task.eveningOnly,
        status: task.status,
        isSomeday: task.isSomeday,
        parentId: task.parentId,
      })),
      events,
    });
  }

  private async eventsOn(ownerId: string, date: string, timeZone: string) {
    const bounds = dayBounds(date, timeZone);
    if (bounds === null) {
      return [];
    }
    const rows = await this.prisma.externalEvent.findMany({
      where: {
        ownerId,
        deletedAt: null,
        startsAt: { lt: bounds.end },
        OR: [{ endsAt: null }, { endsAt: { gt: bounds.start } }],
        subscription: { deletedAt: null, visible: true },
      },
      select: { id: true, title: true, startsAt: true, endsAt: true, isAllDay: true },
    });
    return rows.flatMap((row) =>
      row.endsAt === null
        ? []
        : [
            {
              id: row.id,
              title: row.title,
              startsAt: row.startsAt.toISOString(),
              endsAt: row.endsAt.toISOString(),
              isAllDay: row.isAllDay,
            },
          ],
    );
  }

  private async occupancy(
    ownerId: string,
    today: string,
    timeZone: string,
    moving: readonly ClosingTask[],
  ): Promise<Record<string, DayOccupancy>> {
    const movingIds = new Set(moving.map((task) => task.id));
    const occupancy: Record<string, DayOccupancy> = {};
    for (let offset = 1; offset <= 7; offset += 1) {
      const date = shiftCivilDate(today, offset);
      const tasks = (await this.queue(ownerId, date, timeZone)).filter(
        (task) => !movingIds.has(task.id),
      );
      occupancy[date] = {
        tasks: tasks.map((task) => ({
          id: task.id,
          durationMinutes: task.durationMinutes,
          startDate: task.startDate?.toISOString() ?? null,
          dueDate: task.dueDate?.toISOString() ?? null,
          isAllDay: task.isAllDay,
          eveningOnly: task.eveningOnly,
          status: 'active',
          parentId: null,
        })),
        events: await this.eventsOn(ownerId, date, timeZone),
      };
    }
    return occupancy;
  }

  private async review(ownerId: string, localDate: string, timeZone: string) {
    const bounds = dayBounds(localDate, timeZone);
    const done =
      bounds === null
        ? []
        : await this.prisma.task.findMany({
            where: {
              ownerId,
              status: 'completed',
              deletedAt: null,
              parentId: null,
              completedAt: { gte: bounds.start, lt: bounds.end },
            },
            select: {
              id: true,
              title: true,
              completedAt: true,
              project: { select: { name: true } },
            },
          });
    const focus =
      bounds === null
        ? { _sum: { actualSeconds: null } }
        : await this.prisma.focusSession.aggregate({
            where: {
              ownerId,
              deletedAt: null,
              startedAt: { gte: bounds.start, lt: bounds.end },
            },
            _sum: { actualSeconds: true },
          });
    return {
      done_today: done.map((task) => ({
        id: task.id,
        title: task.title,
        project_name: task.project.name,
        completed_at: task.completedAt?.toISOString() ?? null,
      })),
      focus_minutes:
        focus._sum.actualSeconds === null ? 0 : Math.round(focus._sum.actualSeconds / 60),
    };
  }

  private async view(session: SessionRow, ownerId: string): Promise<Record<string, unknown>> {
    const queue = await this.queue(
      ownerId,
      session.plan.localDate,
      session.plan.timeZone,
      session.kind === 'replan',
    );
    const counts = countDecisions(
      session.decisions.map((decision) => ({
        task_id: decision.taskId,
        decision: decision.decision,
        effect: decision.decision,
      })),
    );
    return {
      id: session.id,
      kind: session.kind,
      revision: session.revision,
      state: session.state,
      local_date: session.plan.localDate,
      time_zone: session.plan.timeZone,
      decisions: session.decisions.map((decision) => ({
        task_id: decision.taskId,
        decision: decision.decision,
        target_date: decision.targetDate,
        evening: decision.evening,
        over_deadline: this.overDeadline(
          queue.find((task) => task.id === decision.taskId) ?? null,
          decision.targetDate,
          session.plan.timeZone,
        ),
      })),
      summary: counts,
      pending: queue.length,
      closed: session.state === 'applied',
    };
  }

  private overDeadline(
    task: { dueDate: Date | null; timeZone: string } | null,
    target: string | null,
    timeZone: string,
  ): boolean {
    if (task?.dueDate === null || task === null || target === null) {
      return false;
    }
    const deadline = civilDateKey(task.dueDate.toISOString(), task.timeZone || timeZone);
    return deadline !== null && deadline <= target;
  }

  private candidate(task: ClosingTask): ReplanCandidate {
    return {
      id: task.id,
      title: task.title,
      priority: task.priority,
      dueDate: task.dueDate?.toISOString() ?? null,
      timeZone: task.timeZone,
      durationMinutes: task.durationMinutes,
      isAllDay: task.isAllDay,
      eveningOnly: task.eveningOnly,
    };
  }

  private loadJson(date: string, result: DayLoadResult) {
    return {
      date,
      task_minutes: result.taskMinutes,
      event_minutes: result.eventMinutes,
      available_minutes: result.availableMinutes,
      ratio: result.ratio,
      status: result.status,
    };
  }

  private async profile(ownerId: string) {
    const row = await this.prisma.user.findFirst({
      where: { id: ownerId, deletedAt: null },
      select: {
        workDayStart: true,
        workDayEnd: true,
        defaultTaskDuration: true,
        eveningStart: true,
        deadlineSoonDays: true,
        featureFlags: true,
        shutdownReminderTime: true,
      },
    });
    const preference = await this.prisma.viewPreference.findUnique({
      where: { ownerId_key: { ownerId, key: 'planning' } },
    });
    const config = preference?.preferences;
    const days =
      config && typeof config === 'object' && !Array.isArray(config) ? config.work_days : null;
    const workDays =
      Array.isArray(days) &&
      days.every((d) => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6)
        ? (days as number[])
        : [1, 2, 3, 4, 5];
    return {
      workDays,
      workDayStart: row?.workDayStart ?? null,
      workDayEnd: row?.workDayEnd ?? null,
      defaultTaskDuration: row?.defaultTaskDuration ?? 30,
      eveningStart: row?.eveningStart ?? '18:00',
      deadlineSoonDays: row?.deadlineSoonDays ?? 2,
      shutdownOn: featureEnabled(row?.featureFlags, 'day_closing'),
      shutdownReminderTime: row?.shutdownReminderTime ?? null,
    };
  }

  async digestLine(ownerId: string, fireAt: string, timeZone: string): Promise<string | null> {
    const profile = await this.profile(ownerId);
    if (profile.workDayStart === null || profile.workDayEnd === null) {
      return null;
    }
    const date = civilDateKey(fireAt, timeZone);
    if (date === null) {
      return null;
    }
    const result = await this.compute(ownerId, date, timeZone, profile);
    if (result.availableMinutes === null) {
      return null;
    }
    const count = await this.pendingCount(ownerId, date, timeZone);
    if (count === 0 && result.eventMinutes === 0) {
      return null;
    }
    return formatDayLoadLine({
      taskCount: count,
      taskMinutes: result.taskMinutes,
      eventMinutes: result.eventMinutes,
      availableMinutes: result.availableMinutes,
    });
  }

  async shutdownReminder(
    ownerId: string,
    timeZone: string,
    fireAt: string,
  ): Promise<{ readonly pending: number; readonly body: string } | null> {
    const profile = await this.profile(ownerId);
    if (!profile.shutdownOn || profile.shutdownReminderTime === null) {
      return null;
    }
    const date = civilDateKey(fireAt, timeZone);
    if (date === null) {
      return null;
    }
    const pending = await this.pendingCount(ownerId, date, timeZone);
    if (pending === 0) {
      return null;
    }
    return {
      pending,
      body: `🌙 Cierra tu día: quedan ${String(pending)} tareas de hoy\n/cierre`,
    };
  }

  pendingCount(ownerId: string, localDate: string, timeZone: string): Promise<number> {
    return this.queue(ownerId, localDate, timeZone).then((rows) => rows.length);
  }

  async recordSomeday(user: AuthUser, taskId: string, enabled: boolean): Promise<void> {
    await this.prisma.$transaction((tx) =>
      this.events.record(tx, actorOf(user), {
        type: enabled ? DomainEvent.taskSomedaySet : DomainEvent.taskSomedayUnset,
        entityType: 'task',
        entityId: taskId,
        action: 'updated',
        data: { task_id: taskId, someday: enabled },
        previous: null,
      }),
    );
  }

  private targetFor(
    localDate: string,
    decision: PlanDecisionKind,
    targetDate: string | null,
  ): string | null {
    if (decision !== 'plan_day' && decision !== 'later') {
      return null;
    }
    if (targetDate !== null && !DATE.test(targetDate)) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'target_date is invalid',
      );
    }
    return targetDate ?? (decision === 'plan_day' ? shiftCivilDate(localDate, 1) : null);
  }

  private wallStart(date: string, timeZone: string): Date | null {
    const parts = date.split('-').map((part) => Number(part));
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    if (year === undefined || month === undefined || day === undefined) {
      return null;
    }
    const iso = instantFromWall({ year, month, day, hour: 0, minute: 0, second: 0 }, timeZone);
    return iso === null ? null : new Date(iso);
  }

  private async begin(ownerId: string, session: SessionRow, key: string, expectedRevision: number) {
    if (session.state === 'applied') {
      const closed = await this.prisma.planOperation.findUnique({
        where: { ownerId_idempotencyKey: { ownerId, idempotencyKey: key } },
      });
      if (closed?.sessionId === session.id && closed.status === 'applied') {
        return closed;
      }
      throw new DomainException(
        HttpStatus.CONFLICT,
        'plan_closed',
        'This session is already closed',
      );
    }
    if (session.revision !== expectedRevision) {
      throw new DomainException(HttpStatus.CONFLICT, 'revision_conflict', 'The session changed', {
        revision: session.revision,
      });
    }
    try {
      return await this.prisma.planOperation.create({
        data: {
          ownerId,
          sessionId: session.id,
          idempotencyKey: key,
          revision: expectedRevision,
          status: 'pending',
          result: { applied: [] },
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      const existing = await this.prisma.planOperation.findUnique({
        where: { ownerId_idempotencyKey: { ownerId, idempotencyKey: key } },
      });
      if (existing === null) {
        throw error;
      }
      return existing;
    }
  }

  private appliedBody(
    result: Prisma.JsonValue | Prisma.InputJsonValue,
    replayed: boolean,
  ): Record<string, unknown> {
    const applied = readApplied(result as Prisma.JsonValue);
    return {
      applied: true,
      replayed,
      effects: applied,
      closed: true,
      summary: countDecisions(applied),
    };
  }

  private async owned(ownerId: string, id: string): Promise<SessionRow> {
    const session = await this.prisma.planSession.findFirst({
      where: { id, ownerId },
      include: { decisions: true, plan: true },
    });
    if (session === null) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'plan_not_found',
        'Plan session was not found',
      );
    }
    return session;
  }

  private async requireOpen(ownerId: string, id: string): Promise<SessionRow> {
    const session = await this.owned(ownerId, id);
    if (session.state !== 'draft') {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'plan_closed',
        'This session is already closed',
      );
    }
    return session;
  }

  private async bump(id: string): Promise<SessionRow> {
    return this.prisma.planSession.update({
      where: { id },
      data: { revision: { increment: 1 } },
      include: { decisions: true, plan: true },
    });
  }

  private assertDate(value: string): void {
    if (!DATE.test(value)) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'date must be YYYY-MM-DD',
      );
    }
  }

  private assertZone(value: string): void {
    if (value.trim().length === 0) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'time_zone is required',
      );
    }
  }
}

function dayBounds(date: string, timeZone: string): { start: Date; end: Date } | null {
  const parts = date.split('-').map((part) => Number(part));
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (year === undefined || month === undefined || day === undefined) {
    return null;
  }
  const start = instantFromWall({ year, month, day, hour: 0, minute: 0, second: 0 }, timeZone);
  const endDate = shiftCivilDate(date, 1);
  const endParts = endDate.split('-').map((part) => Number(part));
  const end = instantFromWall(
    {
      year: endParts[0] ?? year,
      month: endParts[1] ?? month,
      day: endParts[2] ?? day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
  if (start === null || end === null) {
    return null;
  }
  return { start: new Date(start), end: new Date(end) };
}

function readApplied(result: Prisma.JsonValue): AppliedEffect[] {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    return [];
  }
  const applied = result.applied;
  if (!Array.isArray(applied)) {
    return [];
  }
  return applied.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return [];
    }
    const taskId = item.task_id;
    const decision = item.decision;
    const effect = item.effect;
    if (typeof taskId !== 'string' || typeof decision !== 'string' || typeof effect !== 'string') {
      return [];
    }
    return [{ task_id: taskId, decision, effect }];
  });
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function countDecisions(applied: readonly AppliedEffect[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of applied) {
    counts[item.decision] = (counts[item.decision] ?? 0) + 1;
  }
  return counts;
}

export { dayBounds };
