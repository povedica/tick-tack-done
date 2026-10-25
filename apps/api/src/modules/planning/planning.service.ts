import { AsyncLocalStorage } from 'node:async_hooks';
import { habitCards } from './plan-habits.js';
import { HabitsService } from '../habits/habits.service.js';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type Task, type PlanDecision, type PlanSession } from '@prisma/client';
import {
  isIanaTimeZone,
  civilDateKey,
  effectOf,
  freeSlots,
  actionDate,
  legacyAction,
  storedDecision,
  type PlanningAction,
  planQueue,
  previewPlan,
  staleTaskIds,
  type PlanCard,
  type PlanDecisionKind,
  type PlanQueue,
  type PlanSources,
} from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { DomainException } from '../../http/domain.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TasksService } from '../tasks/tasks.service.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DECISIONS = ['done', 'plan_day', 'later', 'cancel', 'trash', 'skip', 'someday'] as const;

interface SnapshotFile {
  readonly cards: readonly PlanCard[];
  readonly hiddenOverdue: number;
  readonly totals: PlanQueue['totals'];
}

interface AppliedEffect {
  readonly task_id: string;
  readonly decision: PlanDecisionKind;
  readonly effect: string;
  readonly before?: readonly TaskState[];
  readonly after?: readonly TaskState[];
  readonly habitBefore?: number;
  readonly habitAfter?: string | null;
}

interface StoredResult {
  readonly applied: readonly AppliedEffect[];
}

type SessionRow = PlanSession & {
  readonly plan: { readonly id: string; readonly localDate: string; readonly timeZone: string };
  readonly decisions: readonly PlanDecision[];
};

@Injectable()
export class PlanningService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TasksService) private readonly tasks: TasksService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(HabitsService) private readonly habits: HabitsService,
  ) {}

  private readonly transactionContext = new AsyncLocalStorage<Prisma.TransactionClient>();
  private get db() {
    return this.transactionContext.getStore() ?? this.prisma;
  }
  private transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { timeout: number },
  ): Promise<T> {
    const existing = this.transactionContext.getStore();
    return existing
      ? work(existing)
      : this.prisma.$transaction(
          (tx) =>
            this.transactionContext.run(tx, () => this.tasks.inPlanTransaction(tx, () => work(tx))),
          options,
        );
  }

  private async candidateQueue(
    user: AuthUser,
    input: { localDate: string; timeZone: string; sources: PlanSources; limit: number | null },
  ) {
    this.assertDate(input.localDate);
    this.assertZone(input.timeZone);
    const rows = await this.db.task.findMany({
      where: {
        ownerId: user.id,
        ...(user.listIds === null ? {} : { projectId: { in: [...user.listIds] } }),
        deletedAt: null,
        status: 'active',
        kind: 'task',
        parentId: null,
      },
      include: {
        project: { select: { name: true, isInbox: true, color: true } },
        tags: { include: { tag: true } },
        attachments: { where: { deletedAt: null } },
      },
    });
    const queue = planQueue(
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        durationMinutes: row.durationMinutes,
        projectColor: row.project.color,
        repeatRule: row.repeatRule,
        tags: row.tags.map(({ tag }) => ({ id: tag.id, name: tag.name, color: tag.color })),
        attachments: row.attachments.map((file) => ({
          id: file.id,
          name: file.fileName,
          url: file.webViewLink,
        })),
        priority: row.priority,
        dueDate: row.dueDate?.toISOString() ?? null,
        startDate: row.startDate?.toISOString() ?? null,
        isAllDay: row.isAllDay,
        timeZone: row.timeZone,
        status: row.status,
        kind: row.kind,
        parentId: row.parentId,
        projectId: row.projectId,
        projectName: row.project.name,
        inbox: row.project.isInbox,
        updatedAt: row.updatedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        isSomeday: row.isSomeday,
        recurring: row.repeatRule !== null || row.seriesId !== null,
      })),
      input,
    );
    const habits = input.sources.today ? await habitCards(this.prisma, user, input.localDate) : [];
    return {
      ...queue,
      cards: [...queue.cards, ...habits].map((c, rank) => ({ ...c, rank })),
      totals: { ...queue.totals, today: queue.totals.today + habits.length },
    };
  }

  async candidates(
    user: AuthUser,
    input: { localDate: string; timeZone: string; sources: PlanSources; limit: number | null },
  ) {
    const queue = await this.candidateQueue(user, { ...input, timeZone: user.timeZone });
    return { totals: queue.totals, count: queue.cards.length, hidden_overdue: queue.hiddenOverdue };
  }

  async start(
    user: AuthUser,
    input: {
      readonly localDate: string;
      readonly timeZone: string;
      readonly sources: PlanSources;
      readonly limit: number | null;
    },
  ): Promise<Record<string, unknown>> {
    input = { ...input, timeZone: user.timeZone };
    const queue = await this.candidateQueue(user, input);
    const plan = await this.db.dayPlan.upsert({
      where: {
        ownerId_localDate_timeZone: {
          ownerId: user.id,
          localDate: input.localDate,
          timeZone: input.timeZone,
        },
      },
      create: { ownerId: user.id, localDate: input.localDate, timeZone: input.timeZone },
      update: {},
    });
    return this.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
      const existing = await tx.planSession.findFirst({
        where: { ownerId: user.id, planId: plan.id, state: 'draft', kind: 'plan' },
        include: { decisions: true, plan: true },
        orderBy: { createdAt: 'desc' },
      });
      await tx.planSession.updateMany({
        where: {
          ownerId: user.id,
          state: 'draft',
          kind: 'plan',
          plan: { localDate: input.localDate },
          ...(existing ? { id: { not: existing.id } } : {}),
        },
        data: { state: 'discarded' },
      });
      if (existing !== null) {
        const old = this.snapshot(existing);
        if (user.listIds !== null && old.cards.some((c) => !user.listIds?.includes(c.projectId)))
          throw new DomainException(
            HttpStatus.NOT_FOUND,
            'plan_not_found',
            'Plan session was not found',
          );
        const merged = [
          ...queue.cards,
          ...old.cards.filter(
            (c) =>
              !queue.cards.some((n) => n.taskId === c.taskId) &&
              existing.decisions.some((d) => d.taskId === c.taskId),
          ),
        ];
        const refreshed = await tx.planSession.update({
          where: { id: existing.id },
          data: {
            sources: jsonValue(input.sources),
            snapshot: jsonValue({
              ...(existing.snapshot as Prisma.JsonObject),
              cards: merged,
              totals: queue.totals,
              hiddenOverdue: queue.hiddenOverdue,
            }),
          },
          include: { decisions: true, plan: true },
        });
        return this.view(refreshed);
      }
      const session = await tx.planSession.create({
        data: {
          planId: plan.id,
          ownerId: user.id,
          sources: jsonValue(input.sources),
          snapshot: jsonValue({
            cards: queue.cards,
            hiddenOverdue: queue.hiddenOverdue,
            totals: queue.totals,
          }),
        },
        include: { decisions: true, plan: true },
      });
      return this.view(session);
    });
  }

  async get(user: AuthUser, id: string): Promise<Record<string, unknown>> {
    return this.view(await this.owned(user.id, id, user.listIds));
  }

  async decide(
    user: AuthUser,
    sessionId: string,
    taskId: string,
    decision: PlanDecisionKind,
    targetDate: string | null,
    choice?: PlanningAction,
  ): Promise<Record<string, unknown>> {
    return this.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
      return this.decideLocked(user, sessionId, taskId, decision, targetDate, choice);
    });
  }

  private async decideLocked(
    user: AuthUser,
    sessionId: string,
    taskId: string,
    decision: PlanDecisionKind,
    targetDate: string | null,
    choice?: PlanningAction,
  ): Promise<Record<string, unknown>> {
    const session = await this.requireOpen(user.id, sessionId, user.listIds);
    if (!this.snapshot(session).cards.some((card) => card.taskId === taskId)) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'task_not_in_plan',
        'Task is not in this plan',
      );
    }
    const selected =
      choice ??
      legacyAction(
        decision,
        decision === 'later' ? (targetDate ?? nextCivil(session.plan.localDate)) : targetDate,
      );
    try {
      effectOf(selected, session.plan.localDate, session.plan.timeZone);
    } catch (error) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        error instanceof Error ? error.message : 'Invalid choice',
      );
    }
    const target = choice
      ? actionDate(selected, session.plan.localDate)
      : this.targetFor(session.plan.localDate, decision, targetDate);
    if (selected.time) await this.assertSlot(user, session, taskId, selected);
    decision = storedDecision(selected.action);
    const snapshot = session.snapshot as Prisma.JsonObject;
    const extras = readChoices(snapshot);
    await this.db.planSession.update({
      where: { id: sessionId },
      data: { snapshot: jsonValue({ ...snapshot, choices: { ...extras, [taskId]: selected } }) },
    });
    await this.db.planDecision.upsert({
      where: { sessionId_taskId: { sessionId, taskId } },
      create: { sessionId, taskId, decision, targetDate: target },
      update: { decision, targetDate: target },
    });
    return this.view(await this.bump(sessionId));
  }

  private async assertSlot(
    user: AuthUser,
    session: SessionRow,
    taskId: string,
    choice: PlanningAction,
  ): Promise<void> {
    const date = actionDate(choice, session.plan.localDate);
    if (!date || !choice.time) return;
    const profile = await this.db.user.findUniqueOrThrow({ where: { id: user.id } });
    const patch = effectOf(
      choice,
      session.plan.localDate,
      user.timeZone,
      profile.defaultTaskDuration,
    );
    const start = patch?.start_date;
    if (!start) return;
    const from = new Date(start),
      until = new Date(from.getTime() + (choice.duration ?? profile.defaultTaskDuration) * 60000);
    const changed = new Set([
      taskId,
      ...session.decisions.filter((d) => d.decision !== 'skip').map((d) => d.taskId),
    ]);
    const tasks = await this.db.task.findMany({
      where: {
        ownerId: user.id,
        deletedAt: null,
        status: 'active',
        isAllDay: false,
        startDate: { not: null },
        parentId: null,
        isSomeday: false,
      },
    });
    const events = await this.db.externalEvent.findMany({
      where: {
        ownerId: user.id,
        deletedAt: null,
        isAllDay: false,
        startsAt: { lt: until },
        endsAt: { gt: from },
        subscription: { deletedAt: null, visible: true },
      },
    });
    const busy = [
      ...tasks
        .filter((t) => !changed.has(t.id) && t.startDate !== null)
        .map((t) => ({
          id: t.id,
          start: (t.startDate ?? new Date(0)).toISOString(),
          end: new Date(
            (t.startDate?.getTime() ?? 0) +
              (t.durationMinutes ?? profile.defaultTaskDuration) * 60000,
          ).toISOString(),
        })),
      ...events.map((e) => ({
        id: e.id,
        start: e.startsAt.toISOString(),
        end: (e.endsAt ?? e.startsAt).toISOString(),
      })),
    ];
    for (const decision of session.decisions) {
      if (decision.taskId === taskId) continue;
      const pending = readChoices(session.snapshot)[decision.taskId];
      if (!pending?.time || actionDate(pending, session.plan.localDate) !== date) continue;
      const effect = effectOf(
        pending,
        session.plan.localDate,
        user.timeZone,
        profile.defaultTaskDuration,
      );
      if (effect?.start_date)
        busy.push({
          id: decision.taskId,
          start: effect.start_date,
          end: new Date(
            Date.parse(effect.start_date) +
              (pending.duration ?? profile.defaultTaskDuration) * 60000,
          ).toISOString(),
        });
    }
    const slots = freeSlots({
      date,
      timeZone: user.timeZone,
      duration: choice.duration ?? profile.defaultTaskDuration,
      workDayStart: profile.workDayStart,
      workDayEnd: profile.workDayEnd,
      eveningStart: profile.eveningStart,
      busy,
    });
    if (!slots.includes(choice.time))
      throw new DomainException(
        HttpStatus.CONFLICT,
        'slot_unavailable',
        'The chosen time is no longer free',
      );
  }

  async clear(user: AuthUser, sessionId: string, taskId: string): Promise<Record<string, unknown>> {
    return this.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
      await this.requireOpen(user.id, sessionId, user.listIds);
      await this.db.planDecision.deleteMany({ where: { sessionId, taskId } });
      return this.view(await this.bump(sessionId));
    });
  }

  async apply(
    user: AuthUser,
    sessionId: string,
    expectedRevision: number,
    key: string | undefined,
  ): Promise<Record<string, unknown>> {
    return this.transaction(
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
    const session = await this.owned(user.id, sessionId, user.listIds);
    if (!session.decisions.some((d) => d.decision !== 'skip'))
      throw new DomainException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'nothing_to_apply',
        'There are no changes to confirm',
      );
    const operation = await this.begin(user.id, session, key.trim(), expectedRevision);
    if (operation.status === 'applied') {
      return this.appliedBody(operation.id, session, readResult(operation.result));
    }
    const stored = readResult(operation.result);
    const done = new Set(stored.applied.map((item) => item.task_id));
    const pending = session.decisions.filter(
      (decision) => decision.decision !== 'skip' && !done.has(decision.taskId),
    );
    await this.assertFresh(user.id, session, pending);
    for (const decision of pending) {
      const choice = readChoices(session.snapshot)[decision.taskId];
      if (choice?.time) await this.assertSlot(user, session, decision.taskId, choice);
    }
    await this.db.planSession.update({
      where: { id: session.id },
      data: { state: 'applying' },
    });
    const applied = [...stored.applied];
    for (const decision of pending) {
      const habitCard = this.snapshot(session).cards.find(
        (c) => c.taskId === decision.taskId,
      )?.habit;
      const oldHabit = habitCard
        ? await this.db.habitLog.findUnique({
            where: {
              habitId_date: {
                habitId: decision.taskId,
                date: new Date(`${session.plan.localDate}T00:00Z`),
              },
            },
          })
        : null;
      const before = (
        await this.db.task.findMany({
          where: { ownerId: user.id, OR: [{ id: decision.taskId }, { parentId: decision.taskId }] },
          include: {
            checklist: {
              where: { deletedAt: null },
              select: { id: true, status: true, completedAt: true, updatedAt: true },
            },
          },
        })
      ).map(taskState);
      const effect = await this.applyOne(
        user,
        session,
        decision,
        `${key.trim()}:${decision.taskId}`,
      );
      const after = (
        await this.db.task.findMany({
          where: { ownerId: user.id, id: { in: before.map((t) => t.id) } },
          include: {
            checklist: {
              where: { deletedAt: null },
              select: { id: true, status: true, completedAt: true, updatedAt: true },
            },
          },
        })
      ).map(taskState);
      const written = new Set(
        before
          .filter(
            (row) =>
              JSON.stringify(row) !== JSON.stringify(after.find((item) => item.id === row.id)),
          )
          .map((row) => row.id),
      );
      applied.push({
        task_id: decision.taskId,
        decision: decision.decision,
        effect,
        before: before.filter((row) => written.has(row.id)),
        after: after.filter((row) => written.has(row.id)),
        ...(habitCard
          ? {
              habitBefore: oldHabit?.count ?? 0,
              habitAfter:
                (
                  await this.db.habitLog.findUnique({
                    where: {
                      habitId_date: {
                        habitId: decision.taskId,
                        date: new Date(`${session.plan.localDate}T00:00Z`),
                      },
                    },
                  })
                )?.updatedAt.toISOString() ?? null,
            }
          : {}),
      });
      await this.db.planOperation.update({
        where: { id: operation.id },
        data: { result: jsonValue({ applied }) },
      });
    }
    await this.db.planOperation.update({
      where: { id: operation.id },
      data: { status: 'applied', result: jsonValue({ applied }) },
    });
    await this.db.planSession.update({
      where: { id: session.id },
      data: { state: 'applied' },
    });
    await this.transaction((tx) =>
      this.events.record(tx, actorOf(user), {
        type: DomainEvent.planApplied,
        entityType: 'plan_session',
        entityId: session.id,
        action: 'updated',
        data: {
          session_id: session.id,
          plan_id: session.planId,
          task_ids: applied.map((item) => item.task_id),
        },
        previous: null,
      }),
    );
    return this.appliedBody(operation.id, session, { applied });
  }

  async revert(user: AuthUser, operationId: string): Promise<Record<string, unknown>> {
    return this.transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
        const operation = await this.db.planOperation.findFirst({
          where: { id: operationId, ownerId: user.id },
        });
        if (!operation)
          throw new DomainException(
            HttpStatus.NOT_FOUND,
            'operation_not_found',
            'Plan operation was not found',
          );
        if (operation.status === 'reverted')
          return { operation_id: operationId, reverted: true, replayed: true };
        if (operation.status !== 'applied')
          throw new DomainException(
            HttpStatus.CONFLICT,
            'operation_not_applied',
            'Only an applied plan can be reverted',
          );
        const result = readResult(operation.result);
        if (result.applied.some((e) => !e.before || !e.after))
          throw new DomainException(
            HttpStatus.CONFLICT,
            'plan_not_revertible',
            'This legacy operation has no revert snapshot',
          );
        const before = new Map(result.applied.flatMap((e) => e.before ?? []).map((t) => [t.id, t]));
        const after = new Map(result.applied.flatMap((e) => e.after ?? []).map((t) => [t.id, t]));
        const current = await this.db.task.findMany({
          where: { ownerId: user.id, id: { in: [...after.keys()] } },
          include: {
            checklist: {
              where: { deletedAt: null },
              select: { id: true, status: true, completedAt: true, updatedAt: true },
            },
          },
        });
        if (
          current.length !== after.size ||
          current.some(
            (row) =>
              row.version !== after.get(row.id)?.version ||
              JSON.stringify(taskState(row).checklist ?? []) !==
                JSON.stringify(after.get(row.id)?.checklist ?? []) ||
              row.updatedAt.toISOString() !== after.get(row.id)?.updatedAt ||
              (user.listIds !== null && !user.listIds.includes(row.projectId)),
          )
        )
          throw new DomainException(
            HttpStatus.CONFLICT,
            'plan_revert_conflict',
            'A task changed after confirmation; nothing has been reverted',
          );
        const planSession = await this.owned(user.id, operation.sessionId);
        for (const effect of result.applied.filter((e) => e.habitBefore !== undefined)) {
          if (!user.scopes.includes('habits:write'))
            throw new DomainException(
              HttpStatus.FORBIDDEN,
              'scope_missing',
              'habits:write is required',
            );
          const log = await this.db.habitLog.findUnique({
            where: {
              habitId_date: {
                habitId: effect.task_id,
                date: new Date(`${planSession.plan.localDate}T00:00Z`),
              },
            },
          });
          if ((log?.updatedAt.toISOString() ?? null) !== effect.habitAfter)
            throw new DomainException(
              HttpStatus.CONFLICT,
              'plan_revert_conflict',
              'Habit changed after confirmation',
            );
        }
        for (const effect of result.applied.filter((e) => e.effect === 'habit_completed'))
          await this.habits.checkIn(
            user,
            effect.task_id,
            { date: planSession.plan.localDate, count: effect.habitBefore ?? 0 },
            `plan-revert:${operationId}:${effect.task_id}`,
          );
        const context: AuthUser = { ...user, requestSource: 'plan' };
        for (const saved of before.values()) {
          const row = current.find((t) => t.id === saved.id);
          if (!row) continue;
          await this.tasks.restorePlanState(context, saved);
          await this.clearMemberships(user.id, row.id);
        }
        await tx.planOperation.update({ where: { id: operationId }, data: { status: 'reverted' } });
        await this.events.record(tx, actorOf(context), {
          type: 'plan.reverted@v1',
          entityType: 'plan_session',
          entityId: operation.sessionId,
          action: 'updated',
          data: { operation_id: operationId, source: 'plan', task_ids: [...before.keys()] },
          previous: null,
        });
        return { operation_id: operationId, reverted: true, replayed: false };
      },
      { timeout: 60000 },
    );
  }

  async day(user: AuthUser, localDate: string, timeZone: string): Promise<Record<string, unknown>> {
    this.assertDate(localDate);
    this.assertZone(timeZone);
    const plan = await this.db.dayPlan.findUnique({
      where: {
        ownerId_localDate_timeZone: { ownerId: user.id, localDate, timeZone },
      },
      include: {
        sessions: {
          where: { state: 'applied', kind: { in: ['plan', 'replan'] } },
          include: { operations: { where: { status: 'applied' }, orderBy: { updatedAt: 'asc' } } },
        },
        members: {
          ...(user.listIds === null
            ? {}
            : { where: { task: { projectId: { in: [...user.listIds] } } } }),
          orderBy: { rank: 'asc' },
          include: {
            task: {
              select: {
                id: true,
                title: true,
                status: true,
                dueDate: true,
                isAllDay: true,
                priority: true,
                deletedAt: true,
                project: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    const members = (plan?.members ?? []).filter(
      (member) => member.task.deletedAt === null && member.task.status === 'active',
    );
    const saves = (plan?.sessions ?? [])
      .flatMap((session) =>
        session.operations.map((operation) => ({
          at: operation.updatedAt.toISOString(),
          changed: readResult(operation.result).applied.some(
            (effect) => effect.effect !== 'unchanged' && effect.effect !== 'skipped',
          ),
        })),
      )
      .sort((a, b) => a.at.localeCompare(b.at));
    const first = saves[0];
    const changes = saves.slice(1).filter((save) => save.changed);
    return {
      initial_applied_at: first?.at ?? null,
      last_applied_at: changes.at(-1)?.at ?? first?.at ?? null,
      adjustment_count: changes.length,
      id: plan?.id ?? null,
      local_date: localDate,
      time_zone: timeZone,
      members: members.map((member) => ({
        task_id: member.task.id,
        title: member.task.title,
        status: member.task.status,
        priority: member.task.priority,
        due_date: member.task.dueDate?.toISOString() ?? null,
        is_all_day: member.task.isAllDay,
        project_name: member.task.project.name,
        rank: member.rank,
        source: member.source,
      })),
    };
  }

  private async applyOne(
    user: AuthUser,
    session: SessionRow,
    decision: PlanDecision,
    key: string,
  ): Promise<string> {
    const card = this.snapshot(session).cards.find((item) => item.taskId === decision.taskId);
    const rank = card?.rank ?? 0;
    if (card?.habit) {
      if (!user.scopes.includes('habits:write'))
        throw new DomainException(
          HttpStatus.FORBIDDEN,
          'scope_missing',
          'habits:write is required',
        );
      if (decision.decision === 'done')
        await this.habits.checkIn(
          user,
          decision.taskId,
          { date: session.plan.localDate, count: 1 },
          key,
        );
      return decision.decision === 'done'
        ? 'habit_completed'
        : decision.decision === 'skip'
          ? 'skipped'
          : 'habit_scheduled';
    }
    const current = await this.db.task.findFirst({
      where: { id: decision.taskId, ownerId: user.id, deletedAt: null },
    });
    const choice =
      readChoices(session.snapshot)[decision.taskId] ??
      legacyAction(decision.decision, decision.targetDate);
    const patch = effectOf(
      choice,
      session.plan.localDate,
      session.plan.timeZone,
      card?.durationMinutes ?? 30,
    );
    if (current && patch) {
      const sameStart =
        patch.start_date === null
          ? current.startDate === null
          : patch.is_all_day
            ? current.startDate !== null &&
              civilDateKey(current.startDate.toISOString(), session.plan.timeZone) ===
                patch.start_date
            : current.startDate?.toISOString() === patch.start_date;
      if (
        sameStart &&
        (patch.is_all_day === undefined || current.isAllDay === patch.is_all_day) &&
        (patch.duration_minutes === undefined ||
          current.durationMinutes === patch.duration_minutes) &&
        (patch.someday === undefined || current.isSomeday === patch.someday) &&
        (patch.evening_only === undefined || current.eveningOnly === patch.evening_only)
      )
        return 'unchanged';
    }
    if (
      current?.repeatRule &&
      current.seriesId &&
      current.dueDate &&
      decision.decision !== 'done' &&
      decision.decision !== 'skip'
    ) {
      await this.tasks.detach(
        { ...user, requestSource: 'plan' },
        decision.taskId,
        current.dueDate.toISOString(),
        undefined,
      );
    }
    if (decision.decision === 'done') {
      await this.tasks.complete(
        { ...user, requestSource: 'plan' },
        decision.taskId,
        { complete_children: 'complete' },
        key,
      );
      await this.clearMemberships(user.id, decision.taskId);
      return 'completed';
    }
    if (decision.decision === 'cancel') {
      await this.tasks.cancel({ ...user, requestSource: 'plan' }, decision.taskId);
      await this.clearMemberships(user.id, decision.taskId);
      return 'cancelled';
    }
    if (decision.decision === 'trash') {
      const row = await this.db.task.findFirst({
        where: { id: decision.taskId, ownerId: user.id },
        select: { deletedAt: true },
      });
      if (row?.deletedAt === null) {
        await this.tasks.remove({ ...user, requestSource: 'plan' }, decision.taskId);
      }
      await this.clearMemberships(user.id, decision.taskId);
      return 'trashed';
    }
    if (patch !== null) {
      await this.tasks.update({ ...user, requestSource: 'plan' }, decision.taskId, patch);
      await this.clearMemberships(user.id, decision.taskId);
      const date = actionDate(choice, session.plan.localDate);
      if (date !== null)
        await this.place(
          user.id,
          date,
          session.plan.timeZone,
          decision.taskId,
          rank,
          decision.decision,
        );
      return choice.action === 'someday' ? 'someday' : 'planned';
    }
    return 'skipped';
  }

  private async place(
    ownerId: string,
    localDate: string,
    timeZone: string,
    taskId: string,
    rank: number,
    source: string,
  ): Promise<void> {
    const plan = await this.db.dayPlan.upsert({
      where: { ownerId_localDate_timeZone: { ownerId, localDate, timeZone } },
      create: { ownerId, localDate, timeZone },
      update: {},
    });
    await this.db.planMember.upsert({
      where: { planId_taskId: { planId: plan.id, taskId } },
      create: { planId: plan.id, taskId, rank, source },
      update: { rank, source },
    });
  }

  private async clearMemberships(ownerId: string, taskId: string): Promise<void> {
    await this.db.planMember.deleteMany({
      where: { taskId, plan: { ownerId } },
    });
  }

  private async assertFresh(
    ownerId: string,
    session: SessionRow,
    pending: readonly PlanDecision[],
  ): Promise<void> {
    if (pending.length === 0) {
      return;
    }
    const ids = pending
      .filter((d) => !this.snapshot(session).cards.find((c) => c.taskId === d.taskId)?.habit)
      .map((decision) => decision.taskId);
    const current = await this.db.task.findMany({
      where: { ownerId, id: { in: ids } },
      select: { id: true, updatedAt: true, deletedAt: true },
    });
    const stale = staleTaskIds(
      this.snapshot(session).cards.filter((card) => ids.includes(card.taskId)),
      current
        .filter((row) => row.deletedAt === null)
        .map((row) => ({ id: row.id, updatedAt: row.updatedAt.toISOString() })),
    );
    if (stale.length > 0) {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'plan_conflict',
        'A task changed since the preview',
        { task_ids: stale },
      );
    }
  }

  private async begin(
    ownerId: string,
    session: SessionRow,
    key: string,
    expectedRevision: number,
  ): Promise<{ id: string; status: string; result: Prisma.JsonValue }> {
    if (session.state === 'applied' || session.state === 'discarded') {
      const closed = await this.db.planOperation.findUnique({
        where: { ownerId_idempotencyKey: { ownerId, idempotencyKey: key } },
      });
      if (closed?.sessionId === session.id && closed.status === 'applied') {
        return closed;
      }
      throw new DomainException(
        HttpStatus.CONFLICT,
        'plan_closed',
        'This planning session is already closed',
      );
    }
    if (session.revision !== expectedRevision) {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'plan_revision',
        'The plan changed. Review the preview again',
        { revision: session.revision },
      );
    }
    try {
      return await this.db.planOperation.create({
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
      const existing = await this.db.planOperation.findUnique({
        where: { ownerId_idempotencyKey: { ownerId, idempotencyKey: key } },
      });
      if (existing?.sessionId !== session.id || existing.revision !== expectedRevision) {
        throw new DomainException(
          HttpStatus.CONFLICT,
          'idempotency_mismatch',
          'This Idempotency-Key was already used for a different plan',
        );
      }
      return existing;
    }
  }

  private async owned(
    ownerId: string,
    id: string,
    listIds: readonly string[] | null = null,
  ): Promise<SessionRow> {
    const session = await this.db.planSession.findFirst({
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
    if (
      listIds !== null &&
      this.snapshot(session).cards.some((c) => !listIds.includes(c.projectId))
    )
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'plan_not_found',
        'Plan session was not found',
      );
    return session;
  }

  private async requireOpen(
    ownerId: string,
    id: string,
    listIds: readonly string[] | null = null,
  ): Promise<SessionRow> {
    const session = await this.owned(ownerId, id, listIds);
    if (session.state !== 'draft') {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'plan_closed',
        'This planning session is already closed',
      );
    }
    return session;
  }

  private async bump(id: string): Promise<SessionRow> {
    return this.db.planSession.update({
      where: { id },
      data: { revision: { increment: 1 } },
      include: { decisions: true, plan: true },
    });
  }

  private view(session: SessionRow): Record<string, unknown> {
    const snapshot = this.snapshot(session);
    const decisions = session.decisions.map((decision) => ({
      taskId: decision.taskId,
      decision: decision.decision,
      targetDate: decision.targetDate,
    }));
    const preview = previewPlan(snapshot.cards, decisions);
    return {
      id: session.id,
      plan_id: session.planId,
      local_date: session.plan.localDate,
      time_zone: session.plan.timeZone,
      state: session.state,
      revision: session.revision,
      hidden_overdue: snapshot.hiddenOverdue,
      totals: snapshot.totals,
      cards: snapshot.cards.map((card) => ({
        task_id: card.taskId,
        title: card.title,
        content: card.content ?? '',
        duration_minutes: card.durationMinutes ?? null,
        project_color: card.projectColor ?? null,
        repeat_rule: card.repeatRule ?? null,
        tags: card.tags ?? [],
        attachments: card.attachments ?? [],
        section: card.section,
        reason: card.reason,
        reason_text: card.reasonText,
        priority: card.priority,
        due_date: card.dueDate,
        start_date: card.startDate ?? null,
        is_all_day: card.isAllDay,
        time_zone: card.timeZone,
        project_id: card.projectId,
        project_name: card.projectName,
        updated_at: card.updatedAt,
        rank: card.rank,
        recurring: card.recurring ?? null,
        habit: card.habit ?? false,
      })),
      decisions: decisions.map((decision) => ({
        ...(readChoices(session.snapshot)[decision.taskId] ??
          legacyAction(decision.decision, decision.targetDate)),
        task_id: decision.taskId,
        decision: decision.decision,
        target_date: decision.targetDate,
      })),
      preview: {
        complete: preview.complete,
        planned_today: preview.plannedToday,
        planned_later: preview.plannedLater,
        cancel: preview.cancel,
        trash: preview.trash,
        skip: preview.skip,
        untouched: preview.untouched,
        effects: preview.effects.map((effect) => ({
          task_id: effect.taskId,
          title: effect.title,
          decision: effect.decision,
          summary: effect.summary,
          changes_due: effect.changesDue,
        })),
      },
    };
  }

  private appliedBody(
    operationId: string,
    session: SessionRow,
    result: StoredResult,
  ): Record<string, unknown> {
    return {
      operation_id: operationId,
      session_id: session.id,
      plan_id: session.planId,
      applied: result.applied,
    };
  }

  private snapshot(session: PlanSession): SnapshotFile {
    const value = session.snapshot;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'plan_snapshot_invalid',
        'The plan snapshot cannot be read',
      );
    }
    const cards = value.cards;
    if (!isCardList(cards)) {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'plan_snapshot_invalid',
        'The plan snapshot cannot be read',
      );
    }
    const totals = value.totals;
    return {
      cards,
      hiddenOverdue: typeof value.hiddenOverdue === 'number' ? value.hiddenOverdue : 0,
      totals:
        totals !== null && typeof totals === 'object' && !Array.isArray(totals)
          ? {
              today: numberField(totals, 'today'),
              overdue: numberField(totals, 'overdue'),
              inbox: numberField(totals, 'inbox'),
              undated: numberField(totals, 'undated'),
            }
          : { today: 0, overdue: 0, inbox: 0, undated: 0 },
    };
  }

  private targetFor(
    localDate: string,
    decision: PlanDecisionKind,
    targetDate: string | null,
  ): string | null {
    if (decision !== 'later') {
      return null;
    }
    const target = targetDate ?? nextCivil(localDate);
    this.assertDate(target);
    if (target <= localDate) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'target_date must be after the plan day',
      );
    }
    return target;
  }

  private assertDate(value: string): void {
    const parsed = new Date(`${value}T12:00:00Z`);
    if (
      !DATE.test(value) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'local_date is invalid',
      );
    }
  }

  private assertZone(value: string): void {
    if (!isIanaTimeZone(value)) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'time_zone is invalid',
      );
    }
  }
}

function nextCivil(localDate: string): string {
  const [year, month, day] = localDate.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function readResult(value: Prisma.JsonValue): StoredResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { applied: [] };
  }
  const applied = value.applied;
  if (!Array.isArray(applied)) {
    return { applied: [] };
  }
  return {
    applied: applied.flatMap((item) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        return [];
      }
      if (typeof item.task_id !== 'string' || typeof item.effect !== 'string') {
        return [];
      }
      if (!isDecision(item.decision)) {
        return [];
      }
      return [
        {
          task_id: item.task_id,
          decision: item.decision,
          effect: item.effect,
          ...(typeof item.habitBefore === 'number'
            ? {
                habitBefore: item.habitBefore,
                habitAfter: typeof item.habitAfter === 'string' ? item.habitAfter : null,
              }
            : {}),
          ...(Array.isArray(item.before) ? { before: item.before as unknown as TaskState[] } : {}),
          ...(Array.isArray(item.after) ? { after: item.after as unknown as TaskState[] } : {}),
        },
      ];
    }),
  };
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isCardList(value: unknown): value is PlanCard[] {
  return Array.isArray(value) && value.every((card) => isCard(card));
}

function isCard(value: unknown): value is PlanCard {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const card = value as { taskId?: unknown; updatedAt?: unknown; title?: unknown };
  return (
    typeof card.taskId === 'string' &&
    typeof card.updatedAt === 'string' &&
    typeof card.title === 'string'
  );
}

function isDecision(value: unknown): value is PlanDecisionKind {
  return typeof value === 'string' && DECISIONS.some((decision) => decision === value);
}

function numberField(value: object, key: string): number {
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === 'number' ? raw : 0;
}

function readChoices(value: Prisma.JsonValue): Record<string, PlanningAction> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const choices = value.choices;
  if (choices === null || typeof choices !== 'object' || Array.isArray(choices)) return {};
  return choices as unknown as Record<string, PlanningAction>;
}

interface TaskState {
  readonly id: string;
  readonly version: number;
  readonly updatedAt: string;
  readonly startDate: string | null;
  readonly dueDate: string | null;
  readonly timeZone: string;
  readonly isAllDay: boolean;
  readonly durationMinutes: number | null;
  readonly isSomeday: boolean;
  readonly eveningOnly: boolean;
  readonly status: string;
  readonly deletedAt: string | null;
  readonly repeatRule: string | null;
  readonly seriesId: string | null;
  readonly recurrenceOpen: boolean;
  readonly checklist?: readonly {
    id: string;
    status: 'active' | 'completed';
    completedAt: string | null;
    updatedAt: string;
  }[];
}
function taskState(
  row: Task & {
    checklist?: readonly {
      id: string;
      status: 'active' | 'completed';
      completedAt: Date | null;
      updatedAt: Date;
    }[];
  },
): TaskState {
  return {
    id: row.id,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    startDate: row.startDate?.toISOString() ?? null,
    dueDate: row.dueDate?.toISOString() ?? null,
    timeZone: row.timeZone,
    isAllDay: row.isAllDay,
    durationMinutes: row.durationMinutes,
    isSomeday: row.isSomeday,
    eveningOnly: row.eveningOnly,
    status: row.status,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    repeatRule: row.repeatRule,
    seriesId: row.seriesId,
    recurrenceOpen: row.recurrenceOpen,
    checklist:
      row.checklist?.map((item) => ({
        id: item.id,
        status: item.status,
        completedAt: item.completedAt?.toISOString() ?? null,
        updatedAt: item.updatedAt.toISOString(),
      })) ?? [],
  };
}
