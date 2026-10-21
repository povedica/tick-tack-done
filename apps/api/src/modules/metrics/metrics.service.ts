import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  dayKey,
  focusMinutesTotal,
  averageHabitPercent,
  taskSeries,
  type StatsTaskRow,
  readStoredHabit,
  type StatsHabitRow,
  type StatsFocusRow,
} from '@reflexionia/domain';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Single source for focus/habit aggregates used by reports, dashboard and stats (F0). */
@Injectable()
export class MetricsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** RF-2321: SQL buckets after the shared owner/actor/list authorization projection. */
  async taskBuckets(
    tasks: readonly StatsTaskRow[],
    days: readonly string[],
    tz: string,
    group: string,
  ) {
    if (tasks.length === 0) return taskSeries(tasks, days, tz, group);
    const from = days[0] ?? '';
    const to = days.at(-1) ?? '';
    const rows = await this.prisma.$queryRaw<
      {
        date: string;
        completed: number;
        created: number;
        completion_completed: number;
        planned: number;
      }[]
    >(Prisma.sql`
      WITH eligible AS (
        SELECT created_at AT TIME ZONE ${tz} AS created,
          CASE WHEN completed_at <= NOW() THEN completed_at AT TIME ZONE ${tz} END AS done,
          due_date AT TIME ZONE ${tz} AS due
        FROM tasks WHERE id IN (${Prisma.join(tasks.map((task) => Prisma.sql`${task.id}::uuid`))}) AND status <> 'cancelled'
      ), projected AS (
        SELECT CASE WHEN created::date BETWEEN ${from}::date AND ${to}::date THEN date_trunc(${group}, created)::date END AS created,
          CASE WHEN done::date BETWEEN ${from}::date AND ${to}::date THEN date_trunc(${group}, done)::date END AS done,
          CASE WHEN due::date BETWEEN ${from}::date AND ${to}::date THEN date_trunc(${group}, due)::date END AS due
        FROM eligible
      ), dates AS (
        SELECT DISTINCT date_trunc(${group}, day)::date AS day
        FROM generate_series(${from}::date, ${to}::date, '1 day'::interval) AS day
      )
      SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
        COUNT(*) FILTER (WHERE p.done = d.day)::int AS completed,
        COUNT(*) FILTER (WHERE p.created = d.day)::int AS created,
        COUNT(*) FILTER (WHERE p.due = d.day AND p.done = d.day)::int AS completion_completed,
        COUNT(*) FILTER (WHERE p.due = d.day)::int AS planned
      FROM dates d LEFT JOIN projected p ON p.created = d.day OR p.done = d.day OR p.due = d.day
      GROUP BY d.day ORDER BY d.day
    `);
    return rows.map((row) => ({
      ...row,
      rate:
        row.planned === 0 ? null : Math.round((row.completion_completed / row.planned) * 1000) / 10,
    }));
  }

  /** Focus minutes from actualSeconds of focus sessions in [from, to). */
  async focusMinutes(ownerId: string, from: Date, to: Date): Promise<number> {
    const rows = await this.focusRows(ownerId, from, to);
    return focusMinutesTotal(rows);
  }

  async focusPomodoros(ownerId: string, from: Date, to: Date): Promise<number> {
    const rows = await this.focusRows(ownerId, from, to);
    return rows.filter((row) => row.type === 'focus' && row.completed).length;
  }

  async focusRows(ownerId: string, from: Date, to: Date): Promise<StatsFocusRow[]> {
    const rows = await this.prisma.focusSession.findMany({
      where: {
        ownerId,
        deletedAt: null,
        startedAt: { gte: from, lt: to < new Date() ? to : new Date() },
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            projectId: true,
            deletedAt: true,
            priority: true,
            project: { select: { name: true } },
            tags: { select: { tagId: true, tag: { select: { name: true } } } },
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      actualSeconds: row.actualSeconds,
      completed: row.completed,
      interruptedCount: row.interruptedCount,
      taskId: row.task?.deletedAt === null ? row.taskId : null,
      taskTitle: row.task?.deletedAt === null ? row.task.title : null,
      listId: row.task?.deletedAt === null ? row.task.projectId : null,
      listName: row.task?.deletedAt === null ? row.task.project.name : null,
      tagNames: row.task?.deletedAt === null ? row.task.tags.map((link) => link.tag.name) : [],
      tagIds: row.task?.deletedAt === null ? row.task.tags.map((link) => link.tagId) : [],
      priority: row.task?.deletedAt === null ? row.task.priority : 'none',
    }));
  }

  /** Habit check-in rows with count > 0 in the range (for weekly report card). */
  async habitLogsDone(ownerId: string, from: Date, to: Date): Promise<number> {
    return this.prisma.habitLog.count({
      where: {
        ownerId,
        deletedAt: null,
        count: { gt: 0 },
        date: { gte: from, lt: to },
      },
    });
  }

  async habitRows(ownerId: string, tz = 'Europe/Madrid'): Promise<StatsHabitRow[]> {
    const rows = await this.prisma.habit.findMany({
      where: { ownerId, deletedAt: null, archived: false },
      select: {
        id: true,
        name: true,
        icon: true,
        color: true,
        goal: true,
        frequency: true,
        logs: {
          where: {
            deletedAt: null,
            date: {
              lte: new Date(
                `${dayKey(new Date().toISOString(), tz) ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`,
              ),
            },
          },
          select: { date: true, count: true },
        },
      },
    });
    return rows.flatMap((row) => {
      const habit = readStoredHabit(row.goal, row.frequency, null);
      return habit === null
        ? []
        : [
            {
              id: row.id,
              name: row.name,
              icon: row.icon,
              color: row.color,
              history: [...(habit.history ?? [])],
              goal: habit.goal,
              days: habit.days,
              logs: row.logs.map((log) => ({
                date: log.date.toISOString().slice(0, 10),
                count: log.count,
              })),
            },
          ];
    });
  }

  async activeHabitsExpectedDays(ownerId: string, from: Date, to: Date, tz = 'Europe/Madrid') {
    const rows = await this.habitRows(ownerId, tz);
    const start = dayKey(from.toISOString(), tz) ?? '';
    const end = dayKey(new Date(to.getTime() - 1).toISOString(), tz) ?? '';
    const today = dayKey(new Date().toISOString(), tz) ?? end;
    return averageHabitPercent(rows, start, end, today);
  }

  /** Days with at least one completed focus session (for achievement focusDays). */
  async focusDays(ownerId: string, from: Date, to: Date, timeZone: string): Promise<number> {
    const rows = await this.focusRows(ownerId, from, to);
    const days = new Set<string>();
    for (const row of rows) {
      if (row.type !== 'focus' || !row.completed) {
        continue;
      }
      const key = dayKey(row.startedAt, timeZone);
      if (key !== null) {
        days.add(key);
      }
    }
    return days.size;
  }
}
