import { matchesFilter, type FilterClock, type FilterSubject } from '../filters/clause';
import { priorityWeight } from '../dashboard/kpis';
import type { FilterRules, Priority } from '../types';

/** RF-2301. The proposal is a short list. The user still accepts, reorders or cuts it. */
export interface ReviewCandidate {
  readonly id: string;
  readonly title: string;
  readonly priority: Priority;
  readonly dueDate: string | null;
  readonly listId: string;
  readonly listName: string;
  readonly status: 'active' | 'completed' | 'archived' | 'cancelled';
  readonly updatedAt: string;
  readonly tagNames: readonly string[];
  readonly assigneeId: string | null;
  readonly content: string;
  readonly createdAt: string;
  readonly isAllDay: boolean;
  readonly timeZone: string;
}

export interface DailyProposal {
  readonly rule: string;
  readonly task_ids: readonly string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function proposeDaily(
  tasks: readonly ReviewCandidate[],
  nowIso: string,
  rules: FilterRules | null,
  clock: FilterClock,
): DailyProposal {
  const now = Date.parse(nowIso);
  const ranked = tasks
    .filter((task) => task.status === 'active')
    .filter((task) => rules === null || matchesFilter(rules, toSubject(task), clock))
    .map((task) => ({ id: task.id, score: scoreTask(task, now) }))
    .filter((task) => task.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, 7);
  const ids = ranked.length >= 3 ? ranked.map((task) => task.id) : ranked.map((task) => task.id);
  return {
    rule:
      rules === null
        ? 'Vencidas, las que vencen en 24 h y la prioridad. Máximo 7. La UI no decide sola.'
        : 'La gramática de filtros del usuario, y luego vencimiento y prioridad. Máximo 7.',
    task_ids: ids,
  };
}

export interface WeeklyReview {
  readonly rule: string;
  readonly overdue_ids: readonly string[];
  readonly undated_ids: readonly string[];
  readonly stale_list_ids: readonly string[];
  readonly habits_at_risk: readonly string[];
}

export interface HabitRisk {
  readonly id: string;
  readonly name: string;
  readonly missedDays: number;
}

/** RF-2302. Looks forward: overdue, no date, lists quiet for `staleDays`, habits at risk. */
export function proposeWeekly(
  tasks: readonly ReviewCandidate[],
  habits: readonly HabitRisk[],
  nowIso: string,
  staleDays: number,
): WeeklyReview {
  const now = Date.parse(nowIso);
  const staleBefore = now - Math.max(staleDays, 1) * DAY_MS;
  const overdue = tasks.filter(
    (task) => task.status === 'active' && task.dueDate !== null && Date.parse(task.dueDate) < now,
  );
  const undated = tasks.filter((task) => task.status === 'active' && task.dueDate === null);
  const quiet = new Map<string, number>();
  for (const task of tasks) {
    if (task.status !== 'active') {
      continue;
    }
    const updated = Date.parse(task.updatedAt);
    const current = quiet.get(task.listId);
    if (current === undefined || updated > current) {
      quiet.set(task.listId, updated);
    }
  }
  const stale = [...quiet.entries()]
    .filter(([, updated]) => !Number.isNaN(updated) && updated < staleBefore)
    .map(([id]) => id);
  return {
    rule: `Vencidas, sin fecha, listas sin movimiento en ${String(staleDays)} días y hábitos con 3 o más días perdidos.`,
    overdue_ids: overdue.map((task) => task.id),
    undated_ids: undated.map((task) => task.id),
    stale_list_ids: stale,
    habits_at_risk: habits.filter((habit) => habit.missedDays >= 3).map((habit) => habit.id),
  };
}

function scoreTask(task: ReviewCandidate, now: number): number {
  let score = priorityWeight(task.priority);
  if (task.dueDate === null) {
    return score;
  }
  const due = Date.parse(task.dueDate);
  if (Number.isNaN(due)) {
    return score;
  }
  if (due < now) {
    score += 8;
  } else if (due - now <= DAY_MS) {
    score += 5;
  }
  return score;
}

function toSubject(task: ReviewCandidate): FilterSubject {
  return {
    listId: task.listId,
    tagNames: task.tagNames,
    dueDate: task.dueDate,
    isAllDay: task.isAllDay,
    timeZone: task.timeZone,
    priority: task.priority,
    title: task.title,
    content: task.content,
    status: task.status,
    assigneeId: task.assigneeId,
    deleted: false,
    createdAt: task.createdAt,
  };
}
