import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  achievementScore,
  addCalendarDays,
  ageOnComplete,
  buildDayBuckets,
  completionRate,
  countCompletedCreated,
  dayKey,
  distributionBy,
  focusHeatmap,
  focusMinutesTotal,
  focusPomodoros,
  habitRangePercent,
  hourInTz,
  overdueStockSeries,
  parseDayBounds,
  priorityBonus,
  productiveStreak,
  punctualityStats,
  weekdayInTz,
  type StatsFocusRow,
  type StatsHabitRow,
  type StatsTaskRow,
} from '@reflexionia/domain';
import type { AuthUser } from '../../auth/auth-user.js';
import { DomainException } from '../../http/domain.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MetricsService } from '../metrics/metrics.service.js';

export interface StatsQuery {
  readonly from: string;
  readonly to: string;
  readonly tz: string;
  readonly list?: string;
  readonly tag?: string;
  readonly priority?: string;
  readonly type?: string;
}

@Injectable()
export class StatsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {}

  async overview(user: AuthUser, query: StatsQuery) {
    const bounds = this.bounds(query);
    const prev = previousRange(query.from, query.to);
    const [tasks, focus, habits, prevTasks, prevFocus, prevHabits, achievement] = await Promise.all([
      this.loadTasks(user.id, query),
      this.loadFocus(user.id, bounds.start, bounds.end, query),
      this.loadHabits(user.id),
      this.loadTasks(user.id, { ...query, from: prev.from, to: prev.to }),
      this.loadFocus(user.id, prev.start, prev.end, query),
      this.loadHabits(user.id),
      this.achievement(user),
    ]);
    const current = countCompletedCreated(tasks, query.from, query.to, query.tz);
    const previous = countCompletedCreated(prevTasks, prev.from, prev.to, query.tz);
    const rate = completionRate(tasks, query.from, query.to, query.tz);
    const prevRate = completionRate(prevTasks, prev.from, prev.to, query.tz);
    const focusMin = focusMinutesTotal(focus);
    const prevFocusMin = focusMinutesTotal(prevFocus);
    const pomodoros = focusPomodoros(focus);
    const habitPct = averageHabitPercent(habits, query.from, query.to);
    const prevHabitPct = averageHabitPercent(prevHabits, prev.from, prev.to);
    const streak = productiveStreak(tasks, query.tz, query.to);
    const buckets = buildDayBuckets(bounds.days, tasks, focus, habits, query.tz);
    const byWeekday = Array.from({ length: 7 }, (_, index) => ({
      weekday: index + 1,
      completed: 0,
    }));
    const byBand = { morning: 0, afternoon: 0, evening: 0 };
    for (const task of tasks) {
      if (task.completedAt === null) {
        continue;
      }
      const done = dayKey(task.completedAt, query.tz);
      if (done === null || done < query.from || done > query.to) {
        continue;
      }
      const weekday = weekdayInTz(task.completedAt, query.tz);
      if (weekday !== null) {
        const row = byWeekday[weekday - 1];
        if (row !== undefined) {
          row.completed += 1;
        }
      }
      const hour = hourInTz(task.completedAt, query.tz);
      if (hour !== null) {
        if (hour < 12) {
          byBand.morning += 1;
        } else if (hour < 18) {
          byBand.afternoon += 1;
        } else {
          byBand.evening += 1;
        }
      }
    }
    return {
      summary: {
        completed: current.completed,
        completed_delta_percent: deltaPercent(current.completed, previous.completed),
        completion_rate: rate.rate,
        completion_rate_delta_pt:
          rate.rate === null || prevRate.rate === null
            ? null
            : Math.round((rate.rate - prevRate.rate) * 10) / 10,
        completion_completed: rate.completed,
        completion_planned: rate.planned,
        focus_minutes: focusMin,
        focus_minutes_delta_percent: deltaPercent(focusMin, prevFocusMin),
        pomodoros,
        habit_percent: habitPct.percent,
        habit_done: habitPct.done,
        habit_expected: habitPct.expected,
        habit_delta_pt:
          Math.round((habitPct.percent - prevHabitPct.percent) * 10) / 10,
        streak_current: streak.current,
        streak_best_year: streak.best_year,
        achievement,
      },
      trend: buckets.map((bucket) => ({
        date: bucket.date,
        completed: bucket.completed,
        created: bucket.created,
      })),
      best_moment: { by_weekday: byWeekday, by_band: byBand },
      completion_series: buckets.map((bucket) => ({
        date: bucket.date,
        rate:
          bucket.planned === 0
            ? null
            : Math.round((bucket.completed / bucket.planned) * 1000) / 10,
        completed: bucket.completed,
        planned: bucket.planned,
      })),
      phrase: buildPhrase(current.completed, rate, focusMin, habitPct.percent),
    };
  }

  async tasks(user: AuthUser, query: StatsQuery) {
    const bounds = this.bounds(query);
    const tasks = await this.loadTasks(user.id, query);
    const focus = await this.loadFocus(user.id, bounds.start, bounds.end, query);
    const habits = await this.loadHabits(user.id);
    const buckets = buildDayBuckets(bounds.days, tasks, focus, habits, query.tz);
    const rate = completionRate(tasks, query.from, query.to, query.tz);
    const lists = new Map<string, { label: string; color: string | null; value: number }>();
    const tags = new Map<string, { label: string; color: string | null; value: number }>();
    const priorities = new Map<string, number>();
    for (const task of tasks) {
      if (task.completedAt === null) {
        continue;
      }
      const done = dayKey(task.completedAt, query.tz);
      if (done === null || done < query.from || done > query.to) {
        continue;
      }
      const list = lists.get(task.listId) ?? {
        label: task.listName,
        color: task.listColor,
        value: 0,
      };
      list.value += 1;
      lists.set(task.listId, list);
      for (let i = 0; i < task.tagIds.length; i += 1) {
        const tagId = task.tagIds[i] ?? `tag-${String(i)}`;
        const tagName = task.tagNames[i] ?? tagId;
        const tag = tags.get(tagId) ?? { label: tagName, color: null, value: 0 };
        tag.value += 1;
        tags.set(tagId, tag);
      }
      priorities.set(task.priority, (priorities.get(task.priority) ?? 0) + 1);
    }
    return {
      trend: buckets.map((bucket) => ({
        date: bucket.date,
        completed: bucket.completed,
        created: bucket.created,
      })),
      completion_rate: rate,
      completion_series: buckets.map((bucket) => ({
        date: bucket.date,
        rate:
          bucket.planned === 0
            ? null
            : Math.round((bucket.completed / bucket.planned) * 1000) / 10,
        completed: bucket.completed,
        planned: bucket.planned,
      })),
      by_list: distributionBy(
        [...lists.entries()].map(([key, value]) => ({
          key,
          label: value.label,
          color: value.color,
          value: value.value,
        })),
      ),
      by_tag: distributionBy(
        [...tags.entries()].map(([key, value]) => ({
          key,
          label: value.label,
          color: value.color,
          value: value.value,
        })),
      ),
      by_priority: distributionBy(
        [...priorities.entries()].map(([key, value]) => ({
          key,
          label: key,
          color: null,
          value,
        })),
      ),
      punctuality: punctualityStats(tasks, query.from, query.to, query.tz),
      age_on_complete: ageOnComplete(tasks, query.from, query.to, query.tz),
      overdue_stock: overdueStockSeries(tasks, bounds.days, query.tz),
    };
  }

  async focus(user: AuthUser, query: StatsQuery) {
    const bounds = this.bounds(query);
    const sessions = await this.loadFocus(user.id, bounds.start, bounds.end, query);
    const typed =
      query.type === undefined || query.type.length === 0
        ? sessions.filter((session) => session.type === 'focus')
        : sessions.filter((session) => session.type === query.type);
    const buckets = buildDayBuckets(bounds.days, [], typed, [], query.tz);
    const completed = typed.filter((session) => session.completed).length;
    const abandoned = typed.filter((session) => !session.completed && session.endedAt !== null)
      .length;
    const interruptions =
      typed.length === 0
        ? 0
        : typed.reduce((sum, session) => sum + session.interruptedCount, 0) / typed.length;
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, minutes: 0 }));
    for (const session of typed) {
      const hour = hourInTz(session.startedAt, query.tz);
      if (hour === null) {
        continue;
      }
      const row = hours[hour];
      if (row !== undefined) {
        row.minutes += Math.round(session.actualSeconds / 60);
      }
    }
    const best = hours.reduce(
      (winner, row) => (row.minutes > winner.minutes ? row : winner),
      { hour: 0, minutes: 0 },
    );
    const year = Number(query.to.slice(0, 4));
    const lists = new Map<string, { label: string; color: string | null; value: number }>();
    const tags = new Map<string, { label: string; color: string | null; value: number }>();
    const taskMap = new Map<string, { label: string; color: string | null; value: number }>();
    let noTask = 0;
    for (const session of typed) {
      const minutes = Math.round(session.actualSeconds / 60);
      if (session.listId !== null) {
        const list = lists.get(session.listId) ?? {
          label: session.listName ?? 'Lista',
          color: null,
          value: 0,
        };
        list.value += minutes;
        lists.set(session.listId, list);
      }
      for (const tagName of session.tagNames) {
        const tag = tags.get(tagName) ?? { label: tagName, color: null, value: 0 };
        tag.value += minutes;
        tags.set(tagName, tag);
      }
      if (session.taskId === null) {
        noTask += minutes;
      } else {
        const task = taskMap.get(session.taskId) ?? {
          label: session.taskTitle ?? 'Tarea',
          color: null,
          value: 0,
        };
        task.value += minutes;
        taskMap.set(session.taskId, task);
      }
    }
    const byTask = distributionBy([
      ...[...taskMap.entries()].map(([key, value]) => ({
        key,
        label: value.label,
        color: value.color,
        value: value.value,
      })),
      ...(noTask > 0
        ? [{ key: 'none', label: 'Sin tarea', color: null, value: noTask }]
        : []),
    ]);
    const day = query.from === query.to ? query.from : query.to;
    const timeline = typed
      .filter((session) => dayKey(session.startedAt, query.tz) === day)
      .map((session) => ({
        id: session.id,
        start: session.startedAt,
        end: session.endedAt,
        minutes: Math.round(session.actualSeconds / 60),
        task_title: session.taskTitle,
        completed: session.completed,
      }));
    return {
      focus_minutes: focusMinutesTotal(typed),
      pomodoros: focusPomodoros(typed),
      completed_percent:
        completed + abandoned === 0
          ? null
          : Math.round((completed / (completed + abandoned)) * 1000) / 10,
      interruptions_per_session: Math.round(interruptions * 10) / 10,
      trend: buckets.map((bucket) => ({
        date: bucket.date,
        minutes: bucket.focus_minutes,
        pomodoros: bucket.pomodoros,
      })),
      best_hour: best.minutes === 0 ? null : best.hour,
      hours,
      timeline_day: day,
      timeline,
      heatmap: focusHeatmap(typed, year, query.tz),
      by_list: distributionBy(
        [...lists.entries()].map(([key, value]) => ({
          key,
          label: value.label,
          color: value.color,
          value: value.value,
        })),
      ),
      by_tag: distributionBy(
        [...tags.entries()].map(([key, value]) => ({
          key,
          label: value.label,
          color: value.color,
          value: value.value,
        })),
      ),
      by_task: byTask,
    };
  }

  async habits(user: AuthUser, query: StatsQuery) {
    this.bounds(query);
    const habits = await this.loadHabits(user.id);
    const cards = habits.map((habit) => {
      const range = habitRangePercent(habit, query.from, query.to);
      const streaks = habitStreaks(habit);
      return {
        id: habit.id,
        name: habit.name,
        icon: habit.icon,
        color: habit.color,
        streak_current: streaks.current,
        streak_best: streaks.best,
        percent: range.percent,
        done: range.done,
        expected: range.expected,
        heatmap: habit.logs
          .filter((log) => log.date.slice(0, 10).startsWith(query.to.slice(0, 4)))
          .map((log) => ({
            date: log.date.slice(0, 10),
            count: log.count,
            level: log.count >= habit.goal ? 4 : log.count > 0 ? 2 : 0,
          })),
        weakest_weekday: weakestWeekday(habit),
      };
    });
    const ranking = [...cards].sort((a, b) => b.percent - a.percent);
    const global = buildDayBuckets(
      parseDayBounds(query.from, query.to, query.tz)?.days ?? [],
      [],
      [],
      habits,
      query.tz,
    ).map((bucket) => ({ date: bucket.date, percent: bucket.habit_percent }));
    return {
      habits: cards,
      ranking_best: ranking.slice(0, 5),
      ranking_worst: [...ranking].reverse().slice(0, 5),
      global_series: global,
    };
  }

  async achievement(user: AuthUser) {
    const row = await this.prisma.user.findFirst({
      where: { id: user.id },
      select: { achievementsEnabled: true, timeZone: true },
    });
    const enabled = row?.achievementsEnabled ?? true;
    const tz = row?.timeZone ?? user.timeZone ?? 'Europe/Madrid';
    if (!enabled) {
      return achievementScore({ enabled: false });
    }
    const tasks = await this.loadTasks(user.id, {
      from: '2000-01-01',
      to: '2100-12-31',
      tz,
    });
    const focus = await this.metrics.focusRows(
      user.id,
      new Date('2000-01-01T00:00:00.000Z'),
      new Date('2100-01-01T00:00:00.000Z'),
    );
    let onTime = 0;
    let late = 0;
    let priorityPoints = 0;
    for (const task of tasks) {
      if (task.completedAt === null || task.status === 'cancelled') {
        continue;
      }
      if (task.dueDate === null) {
        onTime += 1;
        priorityPoints += priorityBonus(task.priority);
        continue;
      }
      const due = Date.parse(task.dueDate);
      const done = Date.parse(task.completedAt);
      if (done <= due + (task.isAllDay ? 24 * 60 * 60 * 1000 - 1 : 0)) {
        onTime += 1;
        priorityPoints += priorityBonus(task.priority);
      } else {
        late += 1;
      }
    }
    const overdue = tasks.filter(
      (task) =>
        task.status === 'active' &&
        task.dueDate !== null &&
        Date.parse(task.dueDate) < Date.now(),
    ).length;
    const habitCheckIns = await this.prisma.habitLog.count({
      where: { ownerId: user.id, deletedAt: null, count: { gt: 0 } },
    });
    return achievementScore({
      enabled: true,
      completedOnTime: onTime,
      completedLate: late,
      priorityPoints,
      pomodoros: focusPomodoros(focus),
      habitCheckIns,
      overdueCount: overdue,
    });
  }

  async export(user: AuthUser, query: StatsQuery, format: 'csv' | 'json') {
    const overview = await this.overview(user, query);
    const tasks = await this.tasks(user, query);
    const focus = await this.focus(user, query);
    const habits = await this.habits(user, query);
    const payload = { overview, tasks, focus, habits, from: query.from, to: query.to };
    if (format === 'json') {
      return { content_type: 'application/json', body: JSON.stringify(payload, null, 2) };
    }
    const lines = [
      'date,completed,created,focus_minutes,pomodoros',
      ...overview.trend.map((row, index) => {
        const focusRow = focus.trend[index];
        return `${row.date},${String(row.completed)},${String(row.created)},${String(focusRow?.minutes ?? 0)},${String(focusRow?.pomodoros ?? 0)}`;
      }),
    ];
    return { content_type: 'text/csv; charset=utf-8', body: `${lines.join('\n')}\n` };
  }

  private bounds(query: StatsQuery) {
    const bounds = parseDayBounds(query.from, query.to, query.tz);
    if (bounds === null) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'from, to and tz must form a valid range (max 2 years)',
      );
    }
    if (bounds.days.length > 366 * 2) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'range longer than 2 years',
      );
    }
    return {
      start: new Date(bounds.startIso),
      end: new Date(bounds.endIso),
      days: bounds.days,
    };
  }

  private async loadTasks(ownerId: string, query: StatsQuery): Promise<StatsTaskRow[]> {
    const lists =
      query.list === undefined || query.list.length === 0
        ? undefined
        : query.list.split(',').filter((value) => value.length > 0);
    const tags =
      query.tag === undefined || query.tag.length === 0
        ? undefined
        : query.tag.split(',').filter((value) => value.length > 0);
    const priorities =
      query.priority === undefined || query.priority.length === 0
        ? undefined
        : query.priority.split(',').filter((value) => value.length > 0);
    const rows = await this.prisma.task.findMany({
      where: {
        ownerId,
        deletedAt: null,
        ...(lists === undefined ? {} : { projectId: { in: lists } }),
        ...(priorities === undefined ? {} : { priority: { in: priorities as never } }),
        ...(tags === undefined
          ? {}
          : { tags: { some: { tagId: { in: tags } } } }),
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        isAllDay: true,
        createdAt: true,
        completedAt: true,
        dueDate: true,
        projectId: true,
        project: { select: { name: true, color: true } },
        tags: { select: { tagId: true, tag: { select: { name: true } } } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      isAllDay: row.isAllDay,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      dueDate: row.dueDate?.toISOString() ?? null,
      listId: row.projectId,
      listName: row.project.name,
      listColor: row.project.color,
      tagIds: row.tags.map((link) => link.tagId),
      tagNames: row.tags.map((link) => link.tag.name),
    }));
  }

  private async loadFocus(
    ownerId: string,
    from: Date,
    to: Date,
    query: StatsQuery,
  ): Promise<StatsFocusRow[]> {
    const rows = await this.metrics.focusRows(ownerId, from, to);
    const lists =
      query.list === undefined || query.list.length === 0
        ? null
        : new Set(query.list.split(','));
    const tags =
      query.tag === undefined || query.tag.length === 0
        ? null
        : new Set(query.tag.split(','));
    return rows.filter((row) => {
      if (lists !== null && (row.listId === null || !lists.has(row.listId))) {
        return false;
      }
      if (tags !== null && !row.tagNames.some((name) => tags.has(name))) {
        return false;
      }
      return true;
    });
  }

  private async loadHabits(ownerId: string): Promise<StatsHabitRow[]> {
    const rows = await this.prisma.habit.findMany({
      where: { ownerId, deletedAt: null, archived: false },
      select: {
        id: true,
        name: true,
        icon: true,
        color: true,
        goal: true,
        frequency: true,
        logs: { where: { deletedAt: null }, select: { date: true, count: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      color: row.color,
      goal: targetOf(row.goal),
      days: Array.isArray(row.frequency)
        ? row.frequency.filter((value): value is number => typeof value === 'number')
        : [],
      logs: row.logs.map((log) => ({
        date: log.date.toISOString().slice(0, 10),
        count: log.count,
      })),
    }));
  }
}

function targetOf(goal: unknown): number {
  if (typeof goal !== 'object' || goal === null) {
    return 1;
  }
  const record = goal as { target_count?: unknown; targetCount?: unknown };
  const value = record.target_count ?? record.targetCount;
  return typeof value === 'number' && value > 0 ? value : 1;
}

function averageHabitPercent(habits: readonly StatsHabitRow[], from: string, to: string) {
  if (habits.length === 0) {
    return { percent: 0, done: 0, expected: 0 };
  }
  let done = 0;
  let expected = 0;
  for (const habit of habits) {
    const range = habitRangePercent(habit, from, to);
    done += range.done;
    expected += range.expected;
  }
  return {
    done,
    expected,
    percent: expected === 0 ? 0 : Math.round((done / expected) * 1000) / 10,
  };
}

function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function previousRange(from: string, to: string): {
  from: string;
  to: string;
  start: Date;
  end: Date;
} {
  const days =
    Math.round(
      (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
        (24 * 60 * 60 * 1000),
    ) + 1;
  const prevTo = addCalendarDays(from, -1) ?? from;
  const prevFrom = addCalendarDays(prevTo, -(days - 1)) ?? prevTo;
  return {
    from: prevFrom,
    to: prevTo,
    start: new Date(`${prevFrom}T00:00:00.000Z`),
    end: new Date(`${addCalendarDays(prevTo, 1) ?? prevTo}T00:00:00.000Z`),
  };
}

function buildPhrase(
  completed: number,
  rate: { completed: number; planned: number; rate: number | null },
  focusMinutes: number,
  habitPercent: number,
): string {
  const hours = Math.floor(focusMinutes / 60);
  const minutes = focusMinutes % 60;
  const focus =
    hours === 0 ? `${String(minutes)} min de foco` : `${String(hours)} h ${String(minutes)} min de foco`;
  const rateText =
    rate.rate === null
      ? `${String(completed)} completadas`
      : `${String(rate.completed)} completadas de ${String(rate.planned)} planificadas (${String(rate.rate)} %)`;
  return `Este período: ${rateText} · ${focus} · hábitos al ${String(habitPercent)} %.`;
}

function habitStreaks(habit: StatsHabitRow): { current: number; best: number } {
  const done = new Set(
    habit.logs
      .filter((log) => log.count >= habit.goal)
      .map((log) => log.date.slice(0, 10)),
  );
  const sorted = [...done].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of sorted) {
    if (prev !== null && addCalendarDays(prev, 1) === day) {
      run += 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    prev = day;
  }
  let current = 0;
  if (sorted.length > 0) {
    let cursor = sorted[sorted.length - 1] ?? '';
    while (done.has(cursor)) {
      current += 1;
      const previous = addCalendarDays(cursor, -1);
      if (previous === null) {
        break;
      }
      cursor = previous;
    }
  }
  return { current, best };
}

function weakestWeekday(habit: StatsHabitRow): number | null {
  const counts = Array.from({ length: 7 }, () => ({ expected: 0, done: 0 }));
  for (const log of habit.logs) {
    const day = log.date.slice(0, 10);
    const [y, m, d] = day.split('-').map(Number);
    if (y === undefined || m === undefined || d === undefined) {
      continue;
    }
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const row = counts[weekday];
    if (row === undefined) {
      continue;
    }
    if (habit.days.length > 0 && !habit.days.includes(weekday)) {
      continue;
    }
    row.expected += 1;
    if (log.count >= habit.goal) {
      row.done += 1;
    }
  }
  let worst: number | null = null;
  let worstRate = 2;
  for (let i = 0; i < counts.length; i += 1) {
    const row = counts[i];
    if (row === undefined || row.expected === 0) {
      continue;
    }
    const rate = row.done / row.expected;
    if (rate < worstRate) {
      worstRate = rate;
      worst = i;
    }
  }
  return worst;
}
