import { Inject, Injectable } from '@nestjs/common';
import { dayKey, focusMinutesTotal, type StatsFocusRow } from '@reflexionia/domain';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Single source for focus/habit aggregates used by reports, dashboard and stats (F0). */
@Injectable()
export class MetricsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
        startedAt: { gte: from, lt: to },
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            projectId: true,
            project: { select: { name: true } },
            tags: { select: { tag: { select: { name: true } } } },
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
      taskId: row.taskId,
      taskTitle: row.task?.title ?? null,
      listId: row.task?.projectId ?? null,
      listName: row.task?.project.name ?? null,
      tagNames: row.task?.tags.map((link) => link.tag.name) ?? [],
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

  async activeHabitsExpectedDays(
    ownerId: string,
    from: Date,
    to: Date,
  ): Promise<{ done: number; expected: number }> {
    const habits = await this.prisma.habit.findMany({
      where: { ownerId, deletedAt: null, archived: false },
      select: {
        goal: true,
        frequency: true,
        logs: {
          where: { deletedAt: null, date: { gte: from, lt: to } },
          select: { date: true, count: true },
        },
      },
    });
    let done = 0;
    let expected = 0;
    for (const habit of habits) {
      const target = targetOf(habit.goal);
      const days = Array.isArray(habit.frequency)
        ? habit.frequency.filter((value): value is number => typeof value === 'number')
        : [];
      for (let t = from.getTime(); t < to.getTime(); t += 24 * 60 * 60 * 1000) {
        const date = new Date(t);
        const weekday = date.getUTCDay();
        if (days.length > 0 && !days.includes(weekday)) {
          continue;
        }
        expected += 1;
        const key = date.toISOString().slice(0, 10);
        const log = habit.logs.find((row) => row.date.toISOString().slice(0, 10) === key);
        if ((log?.count ?? 0) >= target) {
          done += 1;
        }
      }
    }
    return { done, expected };
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

function targetOf(goal: unknown): number {
  if (typeof goal !== 'object' || goal === null) {
    return 1;
  }
  const record = goal as { target_count?: unknown; targetCount?: unknown };
  const value = record.target_count ?? record.targetCount;
  return typeof value === 'number' && value > 0 ? value : 1;
}
