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
  averageHabitPercent,
  weakestHabitWeekday,
  habitStats,
  hourInTz,
  overdueStockSeries,
  parseDayBounds,
  achievementAt,
  achievementHistory,
  ACHIEVEMENT_LEVELS,
  focusSeries,
  productiveStreak,
  punctualityStats,
  weekdayInTz,
  type StatsFocusRow,
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
  readonly day?: string;
  readonly group?: string;
}

@Injectable()
export class StatsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {}

  async overview(user: AuthUser, query: StatsQuery) {
    const bounds = this.bounds(query);
    const prev = previousRange(query.from, query.to, query.tz);
    const [tasks, focus, habits, prevFocus, achievement] = await Promise.all([
      this.loadTasks(user, query),
      this.loadFocus(user, bounds.start, bounds.end, query),
      this.metrics.habitRows(user.id, query.tz),
      this.loadFocus(user, prev.start, prev.end, query),
      this.achievement(user),
    ]);
    const current = countCompletedCreated(tasks, query.from, query.to, query.tz);
    const previous = countCompletedCreated(tasks, prev.from, prev.to, query.tz);
    const rate = completionRate(tasks, query.from, query.to, query.tz);
    const prevRate = completionRate(tasks, prev.from, prev.to, query.tz);
    const focusMin = focusMinutesTotal(focus);
    const prevFocusMin = focusMinutesTotal(prevFocus);
    const pomodoros = focusPomodoros(focus);
    const habitPct = averageHabitPercent(
      habits,
      query.from,
      query.to,
      dayKey(new Date().toISOString(), query.tz) ?? query.to,
    );
    const prevHabitPct = averageHabitPercent(habits, prev.from, prev.to);
    const streak = productiveStreak(
      tasks,
      query.tz,
      dayKey(new Date().toISOString(), query.tz) ?? query.to,
    );
    const buckets = buildDayBuckets(
      bounds.days,
      tasks,
      focus.filter((row) => row.type === 'focus'),
      habits,
      query.tz,
    );
    const byWeekday = Array.from({ length: 7 }, (_, index) => ({
      weekday: index + 1,
      completed: 0,
    }));
    const byBand = { morning: 0, afternoon: 0, evening: 0 };
    for (const task of tasks) {
      if (task.completedAt === null || task.status === 'cancelled') {
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
    const series = await this.metrics.taskBuckets(
      tasks,
      bounds.days,
      query.tz,
      query.group ?? (bounds.days.length > 90 ? 'week' : 'day'),
    );
    return {
      summary: {
        completed: current.completed,
        completed_previous: previous.completed,
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
        habit_percent: habitPct.expected === 0 ? null : habitPct.percent,
        habit_done: habitPct.done,
        habit_expected: habitPct.expected,
        habit_delta_pt:
          habitPct.expected === 0 || prevHabitPct.expected === 0
            ? null
            : Math.round((habitPct.percent - prevHabitPct.percent) * 10) / 10,
        streak_current: streak.current,
        streak_best_year: streak.best_year,
        achievement,
      },
      trend: series.map(({ date, completed, created }) => ({ date, completed, created })),
      daily: buckets,
      best_moment: { by_weekday: byWeekday, by_band: byBand },
      completion_series: (
        await this.metrics.taskBuckets(
          tasks,
          bounds.days,
          query.tz,
          query.group ?? (bounds.days.length > 90 ? 'month' : 'week'),
        )
      ).map((row) => ({
        date: row.date,
        rate: row.rate,
        completed: row.completion_completed,
        planned: row.planned,
      })),
      phrase: buildPhrase(
        current.completed,
        rate,
        focusMin,
        habitPct.expected === 0 ? null : habitPct.percent,
      ),
    };
  }

  async tasks(user: AuthUser, query: StatsQuery) {
    const bounds = this.bounds(query);
    const tasks = await this.loadTasks(user, query);
    const focus = await this.loadFocus(user, bounds.start, bounds.end, query);
    const habits = await this.metrics.habitRows(user.id, query.tz);
    const buckets = buildDayBuckets(
      bounds.days,
      tasks,
      focus.filter((row) => row.type === 'focus'),
      habits,
      query.tz,
    );
    const rate = completionRate(tasks, query.from, query.to, query.tz);
    const lists = new Map<string, { label: string; color: string | null; value: number }>();
    const tags = new Map<string, { label: string; color: string | null; value: number }>();
    const priorities = new Map<string, number>();
    for (const task of tasks) {
      if (task.completedAt === null || task.status === 'cancelled') {
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
    const series = await this.metrics.taskBuckets(
      tasks,
      bounds.days,
      query.tz,
      query.group ?? (bounds.days.length > 90 ? 'week' : 'day'),
    );
    return {
      trend: series.map(({ date, completed, created }) => ({ date, completed, created })),
      daily: buckets,
      completion_rate: rate,
      completion_series: (
        await this.metrics.taskBuckets(
          tasks,
          bounds.days,
          query.tz,
          query.group ?? (bounds.days.length > 90 ? 'month' : 'week'),
        )
      ).map((row) => ({
        date: row.date,
        rate: row.rate,
        completed: row.completion_completed,
        planned: row.planned,
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
    const sessions = await this.loadFocus(user, bounds.start, bounds.end, query);
    const typed =
      query.type === undefined || query.type.length === 0
        ? sessions.filter((session) => session.type === 'focus')
        : sessions.filter((session) => session.type === query.type);
    const buckets = buildDayBuckets(bounds.days, [], typed, [], query.tz);
    const completed = typed.filter((session) => session.completed).length;
    const abandoned = typed.filter(
      (session) => !session.completed && session.endedAt !== null,
    ).length;
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
        row.minutes += session.actualSeconds / 60;
      }
    }
    const best = hours.reduce((winner, row) => (row.minutes > winner.minutes ? row : winner), {
      hour: 0,
      minutes: 0,
    });
    const year = Number(query.to.slice(0, 4));
    const lists = new Map<string, { label: string; color: string | null; value: number }>();
    const tags = new Map<string, { label: string; color: string | null; value: number }>();
    const taskMap = new Map<string, { label: string; color: string | null; value: number }>();
    let noTask = 0;
    for (const session of typed) {
      const minutes = session.actualSeconds / 60;
      if (session.listId !== null) {
        const list = lists.get(session.listId) ?? {
          label: session.listName ?? 'Lista',
          color: null,
          value: 0,
        };
        list.value += minutes;
        lists.set(session.listId, list);
      }
      if (session.listId === null) {
        const row = lists.get('none') ?? { label: 'Sin tarea', color: null, value: 0 };
        row.value += minutes;
        lists.set('none', row);
      }
      const sessionTags = session.tagNames.length === 0 ? ['Sin etiqueta'] : session.tagNames;
      for (const tagName of sessionTags) {
        const tag = tags.get(tagName) ?? { label: tagName, color: null, value: 0 };
        tag.value += minutes / sessionTags.length;
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
      ...(noTask > 0 ? [{ key: 'none', label: 'Sin tarea', color: null, value: noTask }] : []),
    ]);
    const day = query.day ?? dayKey(new Date().toISOString(), query.tz) ?? query.to;
    if (parseDayBounds(day, day, query.tz) === null)
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Invalid selected day',
      );
    const annual = this.bounds({
      ...query,
      from: `${String(year)}-01-01`,
      to: `${String(year)}-12-31`,
    });
    const allSessions = await this.loadFocus(user, annual.start, annual.end, query);
    const annualTyped = allSessions.filter((session) => session.type === (query.type ?? 'focus'));
    const canReadTasks = user.scopes.includes('tasks:read');
    const toTimeline = (session: StatsFocusRow) => ({
      id: session.id,
      start: session.startedAt,
      end: session.endedAt,
      minutes: session.actualSeconds / 60,
      task_title: canReadTasks ? session.taskTitle : null,
      completed: session.completed,
    });
    const dayBounds = this.bounds({ ...query, from: day, to: day });
    const daySessions = day.startsWith(String(year))
      ? annualTyped
      : (await this.loadFocus(user, dayBounds.start, dayBounds.end, query)).filter(
          (session) => session.type === (query.type ?? 'focus'),
        );
    const timeline = daySessions
      .filter((session) => dayKey(session.startedAt, query.tz) === day)
      .map((session) => ({
        id: session.id,
        start: session.startedAt,
        end: session.endedAt,
        minutes: session.actualSeconds / 60,
        task_title: canReadTasks ? session.taskTitle : null,
        completed: session.completed,
      }));
    return {
      focus_minutes: typed.reduce((sum, session) => sum + session.actualSeconds, 0) / 60,
      focus_seconds: typed.reduce((sum, session) => sum + session.actualSeconds, 0),
      pomodoros: focusPomodoros(typed),
      completed_sessions: completed,
      abandoned_sessions: abandoned,
      completed_percent:
        completed + abandoned === 0
          ? null
          : Math.round((completed / (completed + abandoned)) * 1000) / 10,
      interruptions_per_session: Math.round(interruptions * 10) / 10,
      trend: focusSeries(buckets, query.group ?? (bounds.days.length > 90 ? 'week' : 'day')),
      best_hour:
        typed.reduce((sum, row) => sum + row.actualSeconds, 0) < 25 * 60 ? null : best.hour,
      hours,
      period_timeline: typed.map(toTimeline),
      timeline_day: day,
      timeline,
      heatmap: focusHeatmap(annualTyped, year, query.tz),
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
      by_task: canReadTasks ? byTask : [],
    };
  }

  async habits(user: AuthUser, query: StatsQuery) {
    this.bounds(query);
    const habits = await this.metrics.habitRows(user.id, query.tz);
    const cards = habits.map((habit) => {
      const now = new Date().toISOString();
      const today = dayKey(now, query.tz) ?? query.to;
      const range = habitRangePercent(habit, query.from, query.to, today);
      const stats = habitStats({
        ...habit,
        timeZone: query.tz,
        now,
        year: Number(query.to.slice(0, 4)),
      });
      return {
        id: habit.id,
        name: habit.name,
        icon: habit.icon,
        color: habit.color,
        streak_current: stats?.streakCurrent ?? 0,
        streak_best: stats?.streakBest ?? 0,
        percent: range.percent,
        done: range.done,
        expected: range.expected,
        heatmap: (stats?.heatmap ?? []).map((cell) => ({
          ...cell,
          level: cell.met ? 4 : cell.count > 0 ? 2 : 0,
        })),
        weakest_weekday: weakestHabitWeekday(habit, query.from, query.to, today),
      };
    });
    const ranking = [...cards].sort((a, b) => b.percent - a.percent);
    const global = buildDayBuckets(
      parseDayBounds(query.from, query.to, query.tz)?.days ?? [],
      [],
      [],
      habits,
      query.tz,
    ).map((bucket) => ({
      date: bucket.date,
      percent:
        bucket.date > (dayKey(new Date().toISOString(), query.tz) ?? query.to)
          ? null
          : bucket.habit_percent,
    }));
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
    const tz = row?.timeZone ?? user.timeZone;
    if (!enabled) {
      return {
        ...achievementScore({ enabled: false }),
        levels: ACHIEVEMENT_LEVELS,
        history: [] as { date: string; score: number | null }[],
      };
    }
    const tasks = await this.loadTasks(user, {
      from: '2000-01-01',
      to: '2100-12-31',
      tz,
    });
    const focus = await this.loadFocus(
      user,
      new Date('2000-01-01T00:00:00.000Z'),
      new Date('2100-01-01T00:00:00.000Z'),
      { from: '', to: '', tz },
    );
    const logs = await this.prisma.habitLog.findMany({
      where: { ownerId: user.id, deletedAt: null, count: { gt: 0 } },
      select: { date: true, count: true },
    });
    const habitLogs = logs.map((log) => ({
      date: log.date.toISOString().slice(0, 10),
      count: log.count,
    }));
    const now = new Date().toISOString();
    const today = dayKey(now, tz) ?? '';
    const start = addCalendarDays(today, -89) ?? today;
    const history = achievementHistory(
      tasks,
      focus,
      habitLogs,
      parseDayBounds(start, today, tz)?.days ?? [],
      now,
      tz,
    );
    return {
      ...achievementAt(tasks, focus, habitLogs, now, tz),
      levels: ACHIEVEMENT_LEVELS,
      history,
    };
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
      'date,completed,created,completion_completed,planned,completion_rate,focus_seconds,focus_minutes,pomodoros,habit_percent',
      ...overview.daily.map((row) =>
        [
          row.date,
          row.completed,
          row.created,
          row.completion_completed,
          row.planned,
          row.planned === 0 ? '' : (row.completion_completed / row.planned) * 100,
          row.focus_seconds,
          row.focus_minutes,
          row.pomodoros,
          row.habit_percent ?? '',
        ].join(','),
      ),
      [
        'TOTAL',
        overview.summary.completed,
        overview.daily.reduce((sum, row) => sum + row.created, 0),
        overview.summary.completion_completed,
        overview.summary.completion_planned,
        overview.summary.completion_rate ?? '',
        focus.focus_seconds,
        overview.summary.focus_minutes,
        overview.summary.pomodoros,
        overview.summary.habit_percent,
      ].join(','),
    ];
    return { content_type: 'text/csv; charset=utf-8', body: `${lines.join('\n')}\n` };
  }

  private bounds(query: StatsQuery) {
    if (
      (query.type !== undefined && !['focus', 'short_break', 'long_break'].includes(query.type)) ||
      (query.priority !== undefined &&
        !query.priority
          .split(',')
          .every((value) => ['high', 'medium', 'low', 'none'].includes(value))) ||
      (query.group !== undefined && !['day', 'week', 'month'].includes(query.group))
    ) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Invalid statistics filter',
      );
    }
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

  private async loadTasks(user: AuthUser, query: StatsQuery): Promise<StatsTaskRow[]> {
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
        ownerId: user.id,
        deletedAt: null,
        createdAt: { lte: new Date() },
        ...(user.listIds === null ? {} : { projectId: { in: [...user.listIds] } }),
        ...(lists === undefined
          ? {}
          : {
              projectId: {
                in: lists.filter((id) => user.listIds === null || user.listIds.includes(id)),
              },
            }),
        ...(priorities === undefined ? {} : { priority: { in: priorities as never } }),
        ...(tags === undefined ? {} : { tags: { some: { tagId: { in: tags } } } }),
      },
      select: {
        id: true,
        assigneeId: true,
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
    const activity = await this.prisma.activityLog.findMany({
      where: {
        ownerId: user.id,
        entityType: 'task',
        action: 'completed',
        deletedAt: null,
        entityId: { in: rows.filter((row) => row.completedAt !== null).map((row) => row.id) },
      },
      orderBy: { createdAt: 'desc' },
      select: { entityId: true, actorId: true },
    });
    const actors = new Map<string, string>();
    for (const event of activity)
      if (!actors.has(event.entityId)) actors.set(event.entityId, event.actorId);
    return rows
      .filter(
        (row) =>
          (row.assigneeId === null || row.assigneeId === user.id) &&
          (!actors.has(row.id) || actors.get(row.id) === user.id),
      )
      .map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        priority: row.priority,
        isAllDay: row.isAllDay,
        createdAt: row.createdAt.toISOString(),
        completedAt:
          actors.has(row.id) && actors.get(row.id) !== user.id
            ? null
            : row.completedAt !== null && row.completedAt <= new Date()
              ? row.completedAt.toISOString()
              : null,
        dueDate: row.dueDate?.toISOString() ?? null,
        listId: row.projectId,
        listName: row.project.name,
        listColor: row.project.color,
        tagIds: row.tags.map((link) => link.tagId),
        tagNames: row.tags.map((link) => link.tag.name),
      }));
  }

  private async loadFocus(
    user: AuthUser,
    from: Date,
    to: Date,
    query: StatsQuery,
  ): Promise<StatsFocusRow[]> {
    const rows = await this.metrics.focusRows(user.id, from, to);
    const lists =
      query.list === undefined || query.list.length === 0 ? null : new Set(query.list.split(','));
    const tags =
      query.tag === undefined || query.tag.length === 0 ? null : new Set(query.tag.split(','));
    return rows.filter((row) => {
      if (user.listIds !== null && (row.listId === null || !user.listIds.includes(row.listId)))
        return false;
      if (query.priority && !query.priority.split(',').includes(row.priority ?? 'none'))
        return false;
      if (lists !== null && (row.listId === null || !lists.has(row.listId))) {
        return false;
      }
      if (tags !== null && !(row.tagIds ?? []).some((id) => tags.has(id))) {
        return false;
      }
      return true;
    });
  }
}

function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function previousRange(
  from: string,
  to: string,
  tz: string,
): {
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
    start: new Date(parseDayBounds(prevFrom, prevTo, tz)?.startIso ?? ''),
    end: new Date(parseDayBounds(prevFrom, prevTo, tz)?.endIso ?? ''),
  };
}

function buildPhrase(
  completed: number,
  rate: { completed: number; planned: number; rate: number | null },
  focusMinutes: number,
  habitPercent: number | null,
): string {
  const hours = Math.floor(focusMinutes / 60);
  const minutes = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(
    focusMinutes % 60,
  );
  const focus =
    hours === 0 ? `${minutes} min de foco` : `${String(hours)} h ${minutes} min de foco`;
  const rateText =
    rate.rate === null
      ? `${String(completed)} completadas`
      : `${String(rate.completed)} completadas de ${String(rate.planned)} planificadas (${String(rate.rate)} %)`;
  return `Este período: ${rateText} · ${focus} · hábitos ${habitPercent === null ? '—' : `al ${String(habitPercent)} %`}.`;
}
