import { isOverdue } from '../dates/schedule';
import { wallClock } from '../dates/zoned';
import type { Priority } from '../types';

export const DIGEST_TASK_LIMIT = 20;

export interface DigestTag {
  readonly name: string;
}

export interface DigestTask {
  readonly id?: string | null | undefined;
  readonly title: string;
  readonly dueDate: string;
  readonly startDate?: string | null | undefined;
  readonly isAllDay: boolean;
  readonly timeZone: string;
  readonly priority?: Priority | null | undefined;
  readonly listName?: string | null | undefined;
  readonly tags?: readonly DigestTag[] | undefined;
}

export interface DigestItem {
  readonly id: string | null;
  readonly title: string;
  readonly sourceTitle: string;
  readonly dueDate: string;
  readonly startDate: string | null;
  readonly isAllDay: boolean;
  readonly timeZone: string;
  readonly priority: Priority;
  readonly listName: string | null;
  readonly tags: readonly DigestTag[];
}

export interface DailyDigestModel {
  readonly overdue: readonly DigestItem[];
  readonly today: readonly DigestItem[];
  readonly omitted: number;
  readonly overdueCount: number;
  readonly todayCount: number;
}

type DigestBucket = 'overdue' | 'today' | 'skip';

/**
 * NT-14. The morning digest lists still-overdue tasks and tasks due that local day.
 * One-shot overdue signals are not a substitute: a task stays listed until it is done.
 * The plain list is uncapped; the email model applies `limit`.
 */
export function formatDailyDigest(input: {
  readonly tasks: readonly DigestTask[];
  readonly now: string;
  readonly fireAt: string;
}): string {
  const overdue: string[] = [];
  const today: string[] = [];
  for (const task of input.tasks) {
    const bucket = digestBucket(task, input.now, input.fireAt);
    if (bucket === 'overdue') {
      overdue.push(task.title);
    } else if (bucket === 'today') {
      today.push(task.title);
    }
  }
  const parts: string[] = [];
  if (overdue.length > 0) {
    parts.push(['Vencidas', ...overdue.map((title) => `- ${title}`)].join('\n'));
  }
  if (today.length > 0) {
    parts.push(['Hoy', ...today.map((title) => `- ${title}`)].join('\n'));
  }
  if (parts.length === 0) {
    return 'No hay tareas con fecha para hoy.';
  }
  return parts.join('\n\n');
}

/** Structured digest for the email. Overdue is newest first; today is chronological. */
export function buildDailyDigest(input: {
  readonly tasks: readonly DigestTask[];
  readonly now: string;
  readonly fireAt: string;
  readonly limit?: number | undefined;
  /** Rows matched by the query but not included in `tasks` (the fetch is capped). */
  readonly extra?: number | undefined;
}): DailyDigestModel {
  const overdue: DigestItem[] = [];
  const today: DigestItem[] = [];
  for (const task of input.tasks) {
    const bucket = digestBucket(task, input.now, input.fireAt);
    if (bucket === 'skip') {
      continue;
    }
    const item = toItem(task);
    if (bucket === 'overdue') {
      overdue.push(item);
    } else {
      today.push(item);
    }
  }
  overdue.sort((left, right) => Date.parse(right.dueDate) - Date.parse(left.dueDate));
  today.sort((left, right) => {
    if (left.isAllDay !== right.isAllDay) {
      return left.isAllDay ? -1 : 1;
    }
    const leftKey = Date.parse(left.startDate ?? left.dueDate);
    const rightKey = Date.parse(right.startDate ?? right.dueDate);
    return leftKey - rightKey;
  });
  const limit = input.limit ?? DIGEST_TASK_LIMIT;
  const shownOverdue = overdue.slice(0, Math.max(0, limit));
  const shownToday = today.slice(0, Math.max(0, limit - shownOverdue.length));
  return {
    overdue: shownOverdue,
    today: shownToday,
    omitted:
      overdue.length +
      today.length -
      shownOverdue.length -
      shownToday.length +
      Math.max(0, input.extra ?? 0),
    overdueCount: overdue.length,
    todayCount: today.length,
  };
}

/**
 * Drops `#tag` tokens whose name is already a TaskTag. Unknown hashtags stay in the title.
 * Matching is case-insensitive and does not eat a longer token (`#casa` keeps `#casamiento`).
 */
/**
 * Title shown in mail. Known tags are removed. If that leaves nothing, the original
 * title is kept so a link is never empty. A blank source stays blank for the caller.
 */
export function titleForEmail(title: string, tags: readonly DigestTag[]): string {
  const stripped = titleWithoutKnownTags(title, tags).trim();
  if (stripped.length > 0) {
    return stripped;
  }
  return title.trim();
}

export function titleWithoutKnownTags(title: string, tags: readonly DigestTag[]): string {
  const names = tags
    .map((tag) => tag.name.trim())
    .filter((name) => name.length > 0)
    .sort((left, right) => right.length - left.length);
  let result = title;
  for (const name of names) {
    const pattern = new RegExp(`(^|\\s)#${escapeRegExp(name)}(?=$|\\s|[.,;:!?])`, 'gi');
    result = result.replace(pattern, '$1');
  }
  return result.replace(/[ \t]{2,}/g, ' ').trim();
}

function toItem(task: DigestTask): DigestItem {
  const tags = (task.tags ?? [])
    .map((tag) => ({ name: tag.name.trim() }))
    .filter((tag) => tag.name.length > 0);
  return {
    id: task.id ?? null,
    title: titleForEmail(task.title, tags),
    sourceTitle: task.title,
    dueDate: task.dueDate,
    startDate: task.startDate ?? null,
    isAllDay: task.isAllDay,
    timeZone: task.timeZone,
    priority: task.priority ?? 'none',
    listName: task.listName?.trim() ? task.listName.trim() : null,
    tags,
  };
}

function digestBucket(task: DigestTask, now: string, fireAt: string): DigestBucket {
  const late = isOverdue({
    status: 'active',
    dueDate: task.dueDate,
    startDate: task.startDate,
    isAllDay: task.isAllDay,
    timeZone: task.timeZone,
    now,
  });
  if (late) {
    return 'overdue';
  }
  if (sameLocalDay(task.dueDate, fireAt, task.timeZone)) {
    return 'today';
  }
  return 'skip';
}

function sameLocalDay(dueIso: string, fireIso: string, timeZone: string): boolean {
  const due = wallClock(dueIso, timeZone);
  const fire = wallClock(fireIso, timeZone);
  if (due === null || fire === null) {
    return false;
  }
  return due.year === fire.year && due.month === fire.month && due.day === fire.day;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
