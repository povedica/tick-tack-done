import { parseTaskInstant } from '../dates/parse-instant';
import { matchesFilter, type FilterClock, type FilterSubject } from '../filters/clause';
import { civilDateKey } from '../planning/day-load';
import type { FilterRules, Priority } from '../types';

/** RF-1004. Urgent is due within 24 h or already overdue. Important is high or medium. */
export type MatrixQuadrant = 'do' | 'schedule' | 'delegate' | 'drop';

export const MATRIX_QUADRANTS: readonly MatrixQuadrant[] = ['do', 'schedule', 'delegate', 'drop'];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MatrixTask {
  readonly priority: Priority;
  readonly dueDate: string | null;
  readonly startDate?: string | null;
  readonly listId: string | null;
  readonly tagIds?: readonly string[];
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

export interface MinimalQuadrantTask {
  readonly priority: Priority;
  readonly dueDate: string | null;
  readonly isAllDay: boolean;
  readonly timeZone: string;
}

export interface MinimalQuadrantPatch {
  readonly priority: Priority;
  readonly dueDate: string | null;
  readonly isAllDay: boolean;
  /** True when the task already belongs in the target quadrant. */
  readonly unchanged: boolean;
}

function targetNeedsUrgent(quadrant: MatrixQuadrant): boolean {
  return quadrant === 'do' || quadrant === 'delegate';
}

function targetNeedsImportant(quadrant: MatrixQuadrant): boolean {
  return quadrant === 'do' || quadrant === 'schedule';
}

function todayAllDay(nowIso: string, timeZone: string): string {
  const parsed = parseTaskInstant(civilDateKey(nowIso, timeZone) ?? nowIso.slice(0, 10), timeZone);
  return parsed.ok ? parsed.iso : nowIso;
}

function plusDaysAllDay(nowIso: string, timeZone: string, days: number): string {
  const key = civilDateKey(nowIso, timeZone) ?? nowIso.slice(0, 10);
  const base = Date.parse(`${key}T12:00:00.000Z`);
  const shifted = new Date(base + days * DAY_MS).toISOString();
  const nextKey = civilDateKey(shifted, timeZone) ?? shifted.slice(0, 10);
  const parsed = parseTaskInstant(nextKey, timeZone);
  return parsed.ok ? parsed.iso : shifted;
}

/**
 * TTD-AUD-62: change only what is needed for the target quadrant.
 * Never clears the due date on drop; preserves all-day when adjusting urgency.
 */
export function minimalQuadrantPatch(
  task: MinimalQuadrantTask,
  target: MatrixQuadrant,
  nowIso: string,
): MinimalQuadrantPatch {
  const zone = task.timeZone.length > 0 ? task.timeZone : 'UTC';
  const urgent = isUrgent(task.dueDate, nowIso);
  const important = isImportant(task.priority);
  const wantUrgent = targetNeedsUrgent(target);
  const wantImportant = targetNeedsImportant(target);

  let priority = task.priority;
  if (wantImportant && !important) {
    priority = target === 'do' ? 'high' : 'medium';
  } else if (!wantImportant && important) {
    priority = target === 'delegate' ? 'low' : 'none';
  }

  let dueDate = task.dueDate;
  let isAllDay = task.isAllDay;
  if (wantUrgent && !urgent) {
    dueDate = todayAllDay(nowIso, zone);
    isAllDay = true;
  } else if (!wantUrgent && urgent && target !== 'drop') {
    dueDate = plusDaysAllDay(nowIso, zone, 2);
    isAllDay = true;
  }
  // drop: keep dueDate as-is (never clear)

  const unchanged =
    priority === task.priority && dueDate === task.dueDate && isAllDay === task.isAllDay;

  return { priority, dueDate, isAllDay, unchanged };
}

function toSubject(task: MatrixTask): FilterSubject {
  return {
    listId: task.listId,
    tagIds: task.tagIds ?? [],
    tagNames: task.tagNames,
    startDate: task.startDate ?? null,
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
