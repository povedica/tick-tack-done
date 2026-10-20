import { habitRangeSummary } from '../habits/habits';
import type { StatsHabitRow } from '../stats/aggregate';

/** RF-2102: a weekly habit remains a weekly target; it is not a daily obligation. */
export function gardenHabits(habits: readonly StatsHabitRow[], today: string, monday: string) {
  const daily = habits.filter((habit) => habit.goal.period === 'day');
  const total = (items: readonly StatsHabitRow[], from: string) =>
    items.reduce(
      (sum, habit) => {
        const value = habitRangeSummary({ ...habit, from, to: today, today });
        return { done: sum.done + value.done, expected: sum.expected + value.expected };
      },
      { done: 0, expected: 0 },
    );
  return {
    today: total(daily, today),
    week: total(habits, monday),
    pending_today: daily
      .filter((habit) => {
        const summary = habitRangeSummary({ ...habit, from: today, to: today, today });
        return summary.expected > summary.done;
      })
      .map((habit) => ({ id: habit.id, name: habit.name })),
  };
}

/** Identity is the shared iCal UID (Google raw payload) or stored UID plus occurrence start. */
export function uniqueGardenEvents<T extends { externalUid: string; startsAt: Date; raw: unknown }>(
  events: readonly T[],
): T[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const raw =
      typeof event.raw === 'object' && event.raw !== null
        ? (event.raw as Record<string, unknown>)
        : {};
    const uid = typeof raw.iCalUID === 'string' ? raw.iCalUID : event.externalUid;
    const key = `${uid}:${event.startsAt.toISOString()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Current links can establish recent activity, but cannot establish never-used history. */
export function gardenTagActivity(
  tasks: readonly {
    taskId: string;
    task: {
      status: string;
      createdAt: Date;
      completedAt: Date | null;
    };
  }[],
  now: Date,
) {
  const since = now.getTime() - 90 * 86_400_000;
  const recent = (value: Date | null) => value !== null && value.getTime() >= since && value <= now;
  return {
    active: new Set(
      tasks.filter((link) => link.task.status === 'active').map((link) => link.taskId),
    ).size,
    recent_activity: tasks.some(
      (link) => recent(link.task.createdAt) || recent(link.task.completedAt),
    )
      ? true
      : null,
  };
}
