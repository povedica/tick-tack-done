import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type Habit, type HabitLog } from '@prisma/client';
import {
  aggregateHeatmap,
  assessCheckIn,
  calendarDate,
  habitStats,
  habitAvailabilityHistory,
  readStoredHabit,
  normalizeHabitDraft,
  type HabitLogEntry,
  type HabitWeekday,
  type NormalizedHabit,
} from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { decodeCursor, slicePage, type Page } from '../../http/cursor.js';
import { DomainException } from '../../http/domain.exception.js';
import { asJson, iso } from '../../http/json.js';
import { normalizeIdempotencyKey, requestFingerprint } from '../../idempotency/fingerprint.js';
import { IdempotencyService } from '../../idempotency/idempotency.service.js';
import { placementPlan } from '../../ordering/placement.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Tx } from '../../prisma/tx.js';
import type {
  CheckInDto,
  CheckInResponseDto,
  CreateHabitDto,
  HabitResponseDto,
  HabitStatsDto,
  UpdateHabitDto,
} from './habits.dto.js';

@Injectable()
export class HabitsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  async list(
    user: AuthUser,
    limit: number,
    cursorRaw: string | undefined,
  ): Promise<Page<HabitResponseDto>> {
    const cursor =
      cursorRaw === undefined || cursorRaw.length === 0 ? undefined : decodeCursor(cursorRaw);
    const rows = await this.prisma.habit.findMany({
      where: {
        ownerId: user.id,
        deletedAt: null,
        ...(cursor === undefined
          ? {}
          : {
              OR: [
                { sortOrder: { gt: cursor.sortOrder } },
                { sortOrder: cursor.sortOrder, id: { gt: cursor.id } },
              ],
            }),
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    const today = this.today(user);
    const logs = await this.logsFor(
      rows.map((row) => row.id),
      today,
    );
    return slicePage(
      rows.map((row) => this.toJson(row, logs.get(row.id) ?? null, today)),
      limit,
    );
  }

  create(
    user: AuthUser,
    dto: CreateHabitDto,
    keyRaw: string | undefined,
  ): Promise<{ statusCode: number; body: HabitResponseDto; replayed: boolean }> {
    const key = normalizeIdempotencyKey(keyRaw);
    return this.idempotency.run({
      ownerId: user.id,
      key,
      fingerprint: requestFingerprint('POST', '/api/v1/habits', dto),
      statusCode: 201,
      execute: (tx) => this.insert(tx, user, dto),
    });
  }

  async get(user: AuthUser, id: string): Promise<HabitResponseDto> {
    const row = await this.require(this.prisma, user.id, id);
    const today = this.today(user);
    const logs = await this.logsFor([id], today);
    return this.toJson(row, logs.get(id) ?? null, today);
  }

  async update(user: AuthUser, id: string, dto: UpdateHabitDto): Promise<HabitResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.require(tx, user.id, id);
      const stored = this.stored(current);
      const draft = normalizeHabitDraft({
        timesPerPeriod: dto.goal?.times_per_period ?? stored.goal.timesPerPeriod,
        period: dto.goal?.period ?? stored.goal.period,
        targetCount: dto.goal?.target_count ?? stored.goal.targetCount,
        days: dto.frequency ?? [...stored.days],
        reminderTime: dto.reminder_time === undefined ? stored.reminderTime : dto.reminder_time,
      });
      if (!draft.ok) {
        throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', draft.reason);
      }
      const startDate = dto.start_date === undefined ? (stored.startDate ?? null) : dto.start_date;
      const paused = dto.paused ?? stored.paused ?? false;
      let history = [...(stored.history ?? [])];
      if (
        dto.goal !== undefined ||
        dto.frequency !== undefined ||
        dto.paused !== undefined ||
        dto.start_date !== undefined
      ) {
        const changed =
          JSON.stringify(stored.goal) !== JSON.stringify(draft.habit.goal) ||
          JSON.stringify(stored.days) !== JSON.stringify(draft.habit.days) ||
          paused !== (stored.paused ?? false) ||
          startDate !== (stored.startDate ?? null);
        if (changed) {
          const today = this.today(user);
          const logs = await tx.habitLog.findMany({
            where: { habitId: id, deletedAt: null },
            select: { date: true, count: true },
          });
          const periods = history.filter((item) => item.to === undefined);
          if (!periods.length)
            periods.push({ from: '1970-01-01', goal: stored.goal, days: stored.days });
          const snapshots = history.filter((item) => item.to !== undefined);
          for (const log of logs) {
            const date = utcDate(log.date);
            if (!snapshots.some((item) => item.from === date)) {
              const effective =
                [...history]
                  .reverse()
                  .find(
                    (item) => item.from <= date && (item.to === undefined || item.to >= date),
                  ) ?? stored;
              snapshots.push({ from: date, to: date, goal: effective.goal, days: effective.days });
            }
          }
          history = [
            ...periods.filter((item) => item.from !== today),
            { from: today, goal: draft.habit.goal, days: draft.habit.days },
            ...snapshots,
          ];
        }
      }
      if (
        dto.start_date !== undefined ||
        dto.paused !== undefined ||
        dto.goal !== undefined ||
        dto.frequency !== undefined
      ) {
        try {
          history = [
            ...habitAvailabilityHistory({
              history,
              goal: draft.habit.goal,
              days: draft.habit.days,
              from: this.today(user),
              startDate,
              paused,
            }),
          ];
        } catch {
          throw new DomainException(
            HttpStatus.BAD_REQUEST,
            'validation_failed',
            'invalid_start_date',
          );
        }
      }
      const reorder = dto.before_id !== undefined || dto.move_to_end === true;
      const rows = await tx.habit.findMany({
        where: { ownerId: user.id, deletedAt: null },
        select: { id: true, sortOrder: true },
      });
      const plan = reorder ? placementPlan(rows, id, dto.before_id, dto.move_to_end) : null;
      if (plan !== null) {
        for (const update of plan.updates) {
          await tx.habit.update({
            where: { id: update.id },
            data: { sortOrder: update.sortOrder },
          });
        }
      }
      const row = await tx.habit.update({
        where: { id },
        data: {
          ...(['goal', 'frequency', 'unit', 'start_date', 'paused', 'challenge_days'].some(
            (key) => (dto as unknown as Record<string, unknown>)[key] !== undefined,
          )
            ? {
                goal: {
                  ...goalObject(current.goal),
                  ...goalJson(draft.habit),
                  schedule_history: asJson(history),
                  start_date: startDate,
                  paused,
                  ...(dto.unit !== undefined ? { unit: blankToNull(dto.unit) } : {}),
                  ...(dto.challenge_days !== undefined
                    ? { challenge_days: dto.challenge_days }
                    : {}),
                },
              }
            : {}),
          ...(dto.name !== undefined ? { name: this.cleanName(dto.name) } : {}),
          ...(dto.icon !== undefined ? { icon: blankToNull(dto.icon) } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
          ...(dto.reminder_time !== undefined ? { reminderTime: draft.habit.reminderTime } : {}),
          ...(dto.motivation_note !== undefined
            ? { motivationNote: blankToNull(dto.motivation_note) }
            : {}),
          ...(dto.archived !== undefined ? { archived: dto.archived } : {}),
          ...(plan !== null ? { sortOrder: plan.movingSortOrder } : {}),
        },
      });
      if (
        paused ||
        dto.archived === true ||
        dto.reminder_time !== undefined ||
        dto.start_date !== undefined
      ) {
        await tx.reminderDelivery.updateMany({
          where: {
            ownerId: user.id,
            kind: 'habit',
            status: { in: ['scheduled', 'failed'] },
            payload: { path: ['habit_id'], equals: id },
          },
          data: { status: 'cancelled' },
        });
      }
      const today = this.today(user);
      const logs = await this.logsFor([id], today, tx);
      const body = this.toJson(row, logs.get(id) ?? null, today);
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.habitUpdated,
        entityType: 'habit',
        entityId: id,
        action: 'updated',
        data: { habit: asJson(body) },
        previous: asJson(this.toJson(current, logs.get(id) ?? null, today)),
      });
      return body;
    });
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.require(tx, user.id, id);
      const row = await tx.habit.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.habitDeleted,
        entityType: 'habit',
        entityId: id,
        action: 'deleted',
        data: { habit: { id, name: current.name, deleted_at: iso(row.deletedAt) } },
        previous: { name: current.name },
      });
    });
  }

  checkIn(
    user: AuthUser,
    id: string,
    dto: CheckInDto,
    keyRaw: string | undefined,
  ): Promise<{ statusCode: number; body: CheckInResponseDto; replayed: boolean }> {
    const key = normalizeIdempotencyKey(keyRaw);
    return this.idempotency.run({
      ownerId: user.id,
      key,
      fingerprint: requestFingerprint('POST', `/api/v1/habits/${id}/checkins`, dto),
      statusCode: 200,
      execute: (tx) => this.writeCheckIn(tx, user, id, dto),
    });
  }

  async stats(user: AuthUser, id: string, yearRaw: string | undefined): Promise<HabitStatsDto> {
    const row = await this.require(this.prisma, user.id, id);
    const stored = this.stored(row);
    const year = this.year(user, yearRaw);
    const habits = await this.prisma.habit.findMany({
      where: { ownerId: user.id, deletedAt: null },
      include: {
        logs: { where: { deletedAt: null }, select: { date: true, count: true, note: true } },
      },
    });
    const now = new Date().toISOString();
    const mine = habits.find((habit) => habit.id === id);
    const logs = (mine?.logs ?? []).map(logEntry);
    const stats = habitStats({
      goal: stored.goal,
      history: stored.history ?? [],
      days: stored.days,
      logs,
      timeZone: user.timeZone,
      now,
      year,
    });
    const aggregate = aggregateHeatmap({
      year,
      habits: habits
        .filter((habit) => !habit.archived)
        .flatMap((habit) => {
          const parsed = readStoredHabit(habit.goal, habit.frequency, habit.reminderTime);
          if (parsed === null) {
            return [];
          }
          return [
            {
              goal: parsed.goal,
              history: parsed.history ?? [],
              days: parsed.days,
              logs: habit.logs.map(logEntry),
            },
          ];
        }),
    });
    if (stats === null || aggregate === null) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'invalid_year');
    }
    return {
      total_checkins: (mine?.logs ?? []).reduce((sum, log) => sum + log.count, 0),
      month_checkins: (mine?.logs ?? [])
        .filter((log) => utcDate(log.date).startsWith(this.today(user).slice(0, 7)))
        .reduce((sum, log) => sum + log.count, 0),
      completed_days: (mine?.logs ?? []).filter((log) => {
        const date = utcDate(log.date);
        const effective = [...(stored.history ?? [])]
          .reverse()
          .find((item) => item.from <= date && (item.to === undefined || item.to >= date));
        return log.count >= (effective?.goal.targetCount ?? stored.goal.targetCount);
      }).length,
      logs: (mine?.logs ?? [])
        .filter((log) => log.count > 0 || log.note !== null)
        .map((log) => ({ date: utcDate(log.date), count: log.count, note: log.note }))
        .sort((a, b) => b.date.localeCompare(a.date)),
      streak_current: stats.streakCurrent,
      streak_best: stats.streakBest,
      completion_percent: {
        week: stats.completionPercent.week,
        month: stats.completionPercent.month,
      },
      heatmap: stats.heatmap.map((cell) => ({ ...cell })),
      aggregate_heatmap: aggregate.map((cell) => ({ ...cell })),
    };
  }

  private async insert(tx: Tx, user: AuthUser, dto: CreateHabitDto): Promise<HabitResponseDto> {
    const draft = normalizeHabitDraft({
      timesPerPeriod: dto.goal.times_per_period,
      period: dto.goal.period,
      targetCount: dto.goal.target_count,
      days: dto.frequency,
      reminderTime: dto.reminder_time ?? null,
    });
    if (!draft.ok) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', draft.reason);
    }
    let history;
    try {
      history = habitAvailabilityHistory({
        history: [],
        goal: draft.habit.goal,
        days: draft.habit.days,
        from: dto.start_date ?? this.today(user),
        startDate: dto.start_date ?? null,
        paused: dto.paused ?? false,
      });
    } catch {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'invalid_start_date');
    }
    const rows = await tx.habit.findMany({
      where: { ownerId: user.id, deletedAt: null },
      select: { id: true, sortOrder: true },
    });
    const plan = placementPlan(rows, null, dto.before_id, dto.move_to_end);
    for (const update of plan.updates) {
      await tx.habit.update({ where: { id: update.id }, data: { sortOrder: update.sortOrder } });
    }
    const row = await tx.habit.create({
      data: {
        ownerId: user.id,
        name: this.cleanName(dto.name),
        icon: blankToNull(dto.icon),
        color: dto.color ?? null,
        goal: {
          ...goalJson(draft.habit),
          challenge_days: dto.challenge_days ?? null,
          unit: blankToNull(dto.unit),
          start_date: dto.start_date ?? null,
          paused: dto.paused ?? false,
          schedule_history: asJson(history),
        },
        frequency: [...draft.habit.days],
        reminderTime: draft.habit.reminderTime,
        motivationNote: blankToNull(dto.motivation_note),
        sortOrder: plan.movingSortOrder,
      },
    });
    const body = this.toJson(row, null, this.today(user));
    await this.events.record(tx, actorOf(user), {
      type: DomainEvent.habitCreated,
      entityType: 'habit',
      entityId: row.id,
      action: 'created',
      data: { habit: asJson(body) },
      previous: null,
    });
    return body;
  }

  private async writeCheckIn(
    tx: Tx,
    user: AuthUser,
    id: string,
    dto: CheckInDto,
  ): Promise<CheckInResponseDto> {
    const habit = await this.require(tx, user.id, id);
    const stored = this.stored(habit);
    if (stored.paused || habit.archived)
      throw new DomainException(
        HttpStatus.CONFLICT,
        'habit_paused',
        'Resume the habit before checking in',
      );
    const existingLogs = await tx.habitLog.findMany({
      where: { habitId: id, deletedAt: null },
      select: { date: true, count: true },
    });
    const now = new Date().toISOString();
    const assessed = assessCheckIn({
      goal: stored.goal,
      history: stored.history ?? [],
      days: stored.days,
      logs: existingLogs.map(logEntry),
      date: dto.date,
      count: dto.count,
      timeZone: user.timeZone,
      now,
    });
    if (!assessed.ok) {
      throw new DomainException(HttpStatus.BAD_REQUEST, assessed.reason, assessed.reason);
    }
    const when = dateValue(dto.date);
    const previous = await tx.habitLog.findUnique({
      where: { habitId_date: { habitId: id, date: when } },
    });
    const note = dto.note === undefined ? (previous?.note ?? null) : blankToNull(dto.note);
    const log = await tx.habitLog.upsert({
      where: { habitId_date: { habitId: id, date: when } },
      create: {
        ownerId: user.id,
        habitId: id,
        date: when,
        count: dto.count,
        note,
      },
      update: { count: dto.count, note, deletedAt: null },
    });
    const body = this.checkInJson(log, assessed.assessment);
    const actor = actorOf(user);
    await this.events.record(tx, actor, {
      type: DomainEvent.habitCheckin,
      entityType: 'habit',
      entityId: id,
      action: 'updated',
      data: asJson({ habit_id: id, date: dto.date, checkin: body }),
      previous: previous === null ? null : { count: previous.count, note: previous.note },
    });
    if (assessed.assessment.goalMet) {
      await this.events.record(tx, actor, {
        type: DomainEvent.habitGoalMet,
        entityType: 'habit',
        entityId: id,
        action: 'completed',
        data: asJson({ habit_id: id, date: dto.date, count: dto.count }),
        previous: null,
      });
    }
    if (assessed.assessment.streakBroken) {
      await this.events.record(tx, actor, {
        type: DomainEvent.habitStreakBroken,
        entityType: 'habit',
        entityId: id,
        action: 'updated',
        data: asJson({ habit_id: id, date: dto.date }),
        previous: null,
      });
    }
    return body;
  }

  private async require(tx: Tx | PrismaService, ownerId: string, id: string): Promise<Habit> {
    const row = await tx.habit.findFirst({ where: { id, ownerId, deletedAt: null } });
    if (row === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'habit_not_found', 'Habit was not found');
    }
    return row;
  }

  private stored(row: Habit): NormalizedHabit {
    const stored = readStoredHabit(row.goal, row.frequency, row.reminderTime);
    if (stored === null) {
      throw new DomainException(HttpStatus.CONFLICT, 'habit_invalid', 'Habit goal is invalid');
    }
    return stored;
  }

  private today(user: AuthUser): string {
    return calendarDate(new Date().toISOString(), user.timeZone) ?? utcDate(new Date());
  }

  private year(user: AuthUser, raw: string | undefined): number {
    if (raw === undefined || raw.length === 0) {
      return Number(this.today(user).slice(0, 4));
    }
    if (!/^\d{4}$/.test(raw)) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'invalid_year');
    }
    return Number(raw);
  }

  private async logsFor(
    ids: readonly string[],
    today: string,
    tx: Tx | PrismaService = this.prisma,
  ): Promise<Map<string, HabitLog>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await tx.habitLog.findMany({
      where: { habitId: { in: [...ids] }, date: dateValue(today), deletedAt: null },
    });
    return new Map(rows.map((row) => [row.habitId, row]));
  }

  private cleanName(name: string): string {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 200) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'invalid_name');
    }
    return trimmed;
  }

  private toJson(row: Habit, log: HabitLog | null, today: string): HabitResponseDto {
    const stored = this.stored(row);
    const count = log === null ? 0 : log.count;
    const effective = [...(stored.history ?? [])]
      .reverse()
      .find((h) => h.from <= today && (!h.to || today <= h.to));
    const scheduled =
      !stored.paused &&
      (stored.startDate == null || today >= stored.startDate) &&
      (effective?.days ?? stored.days).includes(weekdayName(today));
    return {
      unit: stored.unit ?? null,
      start_date: stored.startDate ?? null,
      paused: stored.paused ?? false,
      challenge_days:
        typeof goalObject(row.goal).challenge_days === 'number'
          ? Number(goalObject(row.goal).challenge_days)
          : null,
      id: row.id,
      name: row.name,
      icon: row.icon,
      color: row.color,
      goal: {
        times_per_period: stored.goal.timesPerPeriod,
        period: stored.goal.period,
        target_count: stored.goal.targetCount,
      },
      frequency: [...stored.days],
      reminder_time: stored.reminderTime,
      motivation_note: row.motivationNote,
      archived: row.archived,
      sort_order: row.sortOrder.toString(),
      today: {
        date: today,
        count,
        note: log?.note ?? null,
        met: scheduled && count >= stored.goal.targetCount,
      },
      created_at: iso(row.createdAt) ?? '',
      updated_at: iso(row.updatedAt) ?? '',
    };
  }

  private checkInJson(
    log: HabitLog,
    assessment: { goalMet: boolean; streakBroken: boolean },
  ): CheckInResponseDto {
    return {
      id: log.id,
      habit_id: log.habitId,
      date: utcDate(log.date),
      count: log.count,
      note: log.note,
      goal_met: assessment.goalMet,
      streak_broken: assessment.streakBroken,
    };
  }
}

function goalJson(habit: NormalizedHabit): Prisma.InputJsonObject {
  return {
    times_per_period: habit.goal.timesPerPeriod,
    period: habit.goal.period,
    target_count: habit.goal.targetCount,
  };
}

function logEntry(log: { date: Date; count: number }): HabitLogEntry {
  return { date: utcDate(log.date), count: log.count };
}

function dateValue(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function utcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function blankToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function weekdayName(date: string): HabitWeekday {
  const index = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const names: readonly HabitWeekday[] = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  return names[index] ?? 'monday';
}

function goalObject(value: Prisma.JsonValue): Prisma.InputJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
