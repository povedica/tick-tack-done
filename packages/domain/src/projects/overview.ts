import { isOverdue } from '../dates/schedule';
import { dayKey } from '../stats/aggregate';

/** A project with no task movement for this many calendar days is stale. */
export const PROJECT_STALE_DAYS = 14;

export type ProjectBoardState = 'active' | 'paused' | 'archived';
export type ProjectAttention = 'no_next_action' | 'stale';

export interface ProjectTask {
  readonly id: string;
  readonly title: string;
  readonly status: 'active' | 'completed' | 'archived' | 'cancelled';
  readonly parentId: string | null;
  readonly deletedAt?: string | null;
  readonly isSomeday?: boolean;
  readonly startDate?: string | null;
  readonly dueDate?: string | null;
  readonly isAllDay?: boolean;
  readonly timeZone?: string;
  readonly sortOrder?: number;
}

export interface NextAction {
  readonly taskId: string;
  readonly title: string;
  readonly dueDate: string | null;
  readonly startDate: string | null;
  readonly isAllDay: boolean;
  readonly overdue: boolean;
  readonly actionAt: string | null;
}

export interface ProjectProgress {
  readonly done_count: number;
  readonly total_count: number;
  readonly open_count: number;
}

export interface BoardOrderItem {
  readonly id: string;
  readonly name: string;
  readonly state: ProjectBoardState;
  readonly closedAt: string | null;
  readonly nextAction: { readonly overdue: boolean; readonly actionAt: string | null } | null;
}

export interface ActionChip {
  readonly text: string;
  readonly tone: 'overdue' | 'today' | 'later';
}

const MONTHS_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sept',
  'oct',
  'nov',
  'dic',
] as const;
const MONTHS_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
const WEEKDAYS_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function english(locale: string): boolean {
  return locale.toLowerCase().startsWith('en');
}

function calendarAge(iso: string, now: string, timeZone: string): number | null {
  const thenKey = dayKey(iso, timeZone);
  const nowKey = dayKey(now, timeZone);
  if (thenKey === null || nowKey === null) {
    return null;
  }
  return Math.round(
    (Date.parse(`${nowKey}T12:00:00Z`) - Date.parse(`${thenKey}T12:00:00Z`)) / 86_400_000,
  );
}

function parts(
  iso: string,
  timeZone: string,
): { day: number; month: number; weekday: number } | null {
  const key = dayKey(iso, timeZone);
  if (key === null) {
    return null;
  }
  const [year, month, day] = key.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return null;
  }
  return { day, month, weekday: new Date(`${key}T12:00:00Z`).getUTCDay() };
}

/** Day and short month, without a year: «18 oct» or «Oct 18». */
export function projectDayLabel(iso: string, timeZone: string, locale = 'es'): string {
  const value = parts(iso, timeZone);
  if (value === null) {
    return '';
  }
  const month = (english(locale) ? MONTHS_EN : MONTHS_ES)[value.month - 1] ?? '';
  return english(locale) ? `${month} ${String(value.day)}` : `${String(value.day)} ${month}`;
}

function weekdayLabel(iso: string, timeZone: string, locale: string): string {
  const value = parts(iso, timeZone);
  if (value === null) {
    return '';
  }
  const day = projectDayLabel(iso, timeZone, locale);
  const weekday = (english(locale) ? WEEKDAYS_EN : WEEKDAYS_ES)[value.weekday] ?? '';
  return `${weekday} ${day}`;
}

/**
 * First active top-level task that is not Someday.
 * Overdue instants come first, then dated tasks, then undated tasks by sort order.
 */
export function nextAction(tasks: readonly ProjectTask[], now: string): NextAction | null {
  const ranked = tasks
    .filter(
      (task) =>
        task.status === 'active' &&
        task.parentId === null &&
        (task.deletedAt === undefined || task.deletedAt === null) &&
        task.isSomeday !== true,
    )
    .map((task) => {
      const actionAt = task.startDate ?? task.dueDate ?? null;
      const overdue =
        actionAt !== null &&
        isOverdue({
          status: 'active',
          dueDate: actionAt,
          isAllDay: task.isAllDay === true,
          timeZone: task.timeZone ?? 'UTC',
          now,
        });
      const bucket = actionAt === null ? 2 : overdue ? 0 : 1;
      const time = actionAt === null ? 0 : Date.parse(actionAt);
      return { task, actionAt, overdue, bucket, time: Number.isNaN(time) ? 0 : time };
    })
    .sort(
      (a, b) =>
        a.bucket - b.bucket ||
        a.time - b.time ||
        (a.task.sortOrder ?? 0) - (b.task.sortOrder ?? 0) ||
        a.task.id.localeCompare(b.task.id),
    );
  const first = ranked[0];
  if (first === undefined) {
    return null;
  }
  return {
    taskId: first.task.id,
    title: first.task.title,
    dueDate: first.task.dueDate ?? null,
    startDate: first.task.startDate ?? null,
    isAllDay: first.task.isAllDay === true,
    overdue: first.overdue,
    actionAt: first.actionAt,
  };
}

/** Top-level progress. Cancelled and deleted tasks stay out of the total. */
export function projectProgress(tasks: readonly ProjectTask[]): ProjectProgress {
  let done = 0;
  let total = 0;
  let open = 0;
  for (const task of tasks) {
    if (task.parentId !== null || (task.deletedAt !== undefined && task.deletedAt !== null)) {
      continue;
    }
    if (task.status === 'cancelled') {
      continue;
    }
    total += 1;
    if (task.status === 'completed') {
      done += 1;
    }
    if (task.status === 'active') {
      open += 1;
    }
  }
  return { done_count: done, total_count: total, open_count: open };
}

/** Attention applies only to En marcha. Missing a next action wins over staleness. */
export function projectAttention(
  input: {
    readonly state: ProjectBoardState;
    readonly nextAction: unknown;
    readonly lastActivityAt: string | null;
  },
  now: string,
  timeZone = 'UTC',
): ProjectAttention | null {
  if (input.state !== 'active') {
    return null;
  }
  if (input.nextAction === null) {
    return 'no_next_action';
  }
  if (input.lastActivityAt === null) {
    return 'stale';
  }
  const age = calendarAge(input.lastActivityAt, now, timeZone);
  if (age === null || age >= PROJECT_STALE_DAYS) {
    return 'stale';
  }
  return null;
}

/** «activo hoy», «activo ayer», «activo hace N días» or «activo el 3 oct». */
export function activityLabel(iso: string, now: string, timeZone: string, locale = 'es'): string {
  const age = calendarAge(iso, now, timeZone);
  if (age === null) {
    return '';
  }
  const en = english(locale);
  if (age <= 0) {
    return en ? 'active today' : 'activo hoy';
  }
  if (age === 1) {
    return en ? 'active yesterday' : 'activo ayer';
  }
  if (age < 7) {
    return en ? `active ${String(age)} days ago` : `activo hace ${String(age)} días`;
  }
  const day = projectDayLabel(iso, timeZone, locale);
  return en ? `active on ${day}` : `activo el ${day}`;
}

/** Colored date chip for a next action. Today stays accent; overdue uses danger. */
export function actionDateChip(
  task: {
    readonly startDate: string | null;
    readonly dueDate: string | null;
    readonly isAllDay: boolean;
    readonly timeZone: string;
  },
  now: string,
  locale = 'es',
): ActionChip | null {
  const actionAt = task.startDate ?? task.dueDate;
  if (actionAt === null) {
    return null;
  }
  const age = calendarAge(actionAt, now, task.timeZone);
  if (age === null) {
    return null;
  }
  const en = english(locale);
  if (age === 0) {
    return { text: en ? 'today' : 'hoy', tone: 'today' };
  }
  const overdue = isOverdue({
    status: 'active',
    dueDate: actionAt,
    isAllDay: task.isAllDay,
    timeZone: task.timeZone,
    now,
  });
  if (age === 1 && overdue) {
    return { text: en ? 'yesterday' : 'ayer', tone: 'overdue' };
  }
  return {
    text: weekdayLabel(actionAt, task.timeZone, locale),
    tone: overdue ? 'overdue' : 'later',
  };
}

function openRank(item: BoardOrderItem): number {
  if (item.nextAction === null) {
    return 3;
  }
  if (item.nextAction.overdue) {
    return 0;
  }
  if (item.nextAction.actionAt !== null) {
    return 1;
  }
  return 2;
}

function compareOpen(a: BoardOrderItem, b: BoardOrderItem): number {
  const rank = openRank(a) - openRank(b);
  if (rank !== 0) {
    return rank;
  }
  const bucket = openRank(a);
  if (bucket === 0 || bucket === 1) {
    const time = (a.nextAction?.actionAt ?? '').localeCompare(b.nextAction?.actionAt ?? '');
    if (time !== 0) {
      return time;
    }
  }
  return a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id);
}

/** Active and paused share one order. Archived projects follow closed_at descending. */
export function orderBoardItems<T extends BoardOrderItem>(items: readonly T[]): T[] {
  const archived = items
    .filter((item) => item.state === 'archived')
    .sort(
      (a, b) =>
        (b.closedAt ?? '').localeCompare(a.closedAt ?? '') ||
        a.name.localeCompare(b.name, 'es') ||
        a.id.localeCompare(b.id),
    );
  const open = items.filter((item) => item.state !== 'archived').sort(compareOpen);
  return [...open, ...archived];
}
