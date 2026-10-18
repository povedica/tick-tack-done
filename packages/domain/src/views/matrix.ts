import { matchesFilter, type FilterClock, type FilterSubject } from '../filters/clause';
import type { FilterRules, Priority } from '../types';

/** RF-1004. Urgent is due within 24 h or already overdue. Important is high or medium. */
export type MatrixQuadrant = 'do' | 'schedule' | 'delegate' | 'drop';

export const MATRIX_QUADRANTS: readonly MatrixQuadrant[] = ['do', 'schedule', 'delegate', 'drop'];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MatrixTask {
  readonly priority: Priority;
  readonly dueDate: string | null;
  readonly listId: string | null;
  readonly tagNames: readonly string[];
  readonly title: string;
  readonly content: string;
  readonly status: string;
  readonly assigneeId: string | null;
  readonly createdAt: string;
  readonly isAllDay: boolean;
  readonly timeZone: string;
  readonly deleted: boolean;
}

export interface QuadrantRule {
  readonly quadrant: MatrixQuadrant;
  readonly rules: FilterRules | null;
}

export type DueEffect = 'within_24h' | 'after_24h' | 'clear';

export interface QuadrantEffect {
  readonly priority: Priority;
  readonly due: DueEffect;
}

export const DEFAULT_QUADRANT_EFFECTS: Readonly<Record<MatrixQuadrant, QuadrantEffect>> = {
  do: { priority: 'high', due: 'within_24h' },
  schedule: { priority: 'medium', due: 'after_24h' },
  delegate: { priority: 'low', due: 'within_24h' },
  drop: { priority: 'none', due: 'clear' },
};

export function isUrgent(dueDate: string | null, nowIso: string): boolean {
  if (dueDate === null) {
    return false;
  }
  const due = Date.parse(dueDate);
  const now = Date.parse(nowIso);
  if (Number.isNaN(due) || Number.isNaN(now)) {
    return false;
  }
  return due - now <= DAY_MS;
}

export function isImportant(priority: Priority): boolean {
  return priority === 'high' || priority === 'medium';
}

/** Default quadrants from the spec. No task dependencies. */
export function defaultQuadrant(
  task: Pick<MatrixTask, 'priority' | 'dueDate'>,
  nowIso: string,
): MatrixQuadrant {
  const urgent = isUrgent(task.dueDate, nowIso);
  const important = isImportant(task.priority);
  if (urgent && important) {
    return 'do';
  }
  if (!urgent && important) {
    return 'schedule';
  }
  if (urgent && !important) {
    return 'delegate';
  }
  return 'drop';
}

/**
 * Custom rules use the filter grammar (5.7). The first matching quadrant wins,
 * in do → schedule → delegate → drop order. With no custom rules, the defaults apply.
 */
export function quadrantOf(
  task: MatrixTask,
  rules: readonly QuadrantRule[],
  clock: FilterClock,
): MatrixQuadrant {
  const custom = rules.some((rule) => rule.rules !== null);
  if (!custom) {
    return defaultQuadrant(task, clock.now);
  }
  const subject = toSubject(task);
  for (const quadrant of MATRIX_QUADRANTS) {
    const rule = rules.find((item) => item.quadrant === quadrant);
    if (rule?.rules != null && matchesFilter(rule.rules, subject, clock)) {
      return quadrant;
    }
  }
  return 'drop';
}

export interface QuadrantPatch {
  readonly priority: Priority;
  readonly dueDate: string | null;
}

/** Dropping a card applies the destination quadrant's priority and date effect. */
export function applyQuadrantDrop(effect: QuadrantEffect, nowIso: string): QuadrantPatch {
  const now = Date.parse(nowIso);
  const base = Number.isNaN(now) ? Date.parse('2026-01-01T00:00:00.000Z') : now;
  if (effect.due === 'clear') {
    return { priority: effect.priority, dueDate: null };
  }
  const delta = effect.due === 'within_24h' ? 60 * 60 * 1000 : 7 * DAY_MS;
  return { priority: effect.priority, dueDate: new Date(base + delta).toISOString() };
}

function toSubject(task: MatrixTask): FilterSubject {
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
    deleted: task.deleted,
    createdAt: task.createdAt,
  };
}
