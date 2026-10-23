import { formatDurationMinutes } from '../product/duration';

export type TaskGroupKey = 'priority' | 'due' | 'tag' | 'list' | 'none';
export type TaskSortKey = 'due' | 'priority' | 'title';
export type TaskSortDir = 'asc' | 'desc';

export interface TodayTask {
  readonly id: string;
  readonly title: string;
  readonly priority: 'none' | 'low' | 'medium' | 'high';
  readonly dueDate: string | null;
  readonly timeZone: string;
  readonly allDay: boolean;
  readonly hasReminder: boolean;
  readonly checklistDone: number;
  readonly checklistTotal: number;
  readonly hasContent: boolean;
  readonly hasRepeat: boolean;
  readonly linkCount?: number;
  readonly attachmentCount: number;
  readonly source: string;
  readonly status: 'active' | 'completed' | 'archived' | 'cancelled';
  readonly projectId: string;
  readonly tagIds: readonly string[];
  readonly startDate?: string | null;
  readonly durationMinutes?: number | null;
  readonly isSomeday?: boolean;
  readonly eveningOnly?: boolean;
}

export interface TodayGroup {
  readonly id: string;
  readonly tasks: readonly TodayTask[];
}

const PRIORITY_ORDER = ['high', 'medium', 'low', 'none'] as const;
const PRIORITY_RANK: Record<TodayTask['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

export function parseGroup(value: string | null): TaskGroupKey {
  switch (value) {
    case 'priority':
    case 'due':
    case 'tag':
    case 'list':
    case 'none':
      return value;
    default:
      return 'priority';
  }
}

export function parseSort(value: string | null): TaskSortKey {
  switch (value) {
    case 'due':
    case 'priority':
    case 'title':
      return value;
    default:
      return 'due';
  }
}

export function parseSortDir(value: string | null): TaskSortDir {
  return value === 'desc' ? 'desc' : 'asc';
}

export function groupFromLocation(query: string | null, stored: string | null): TaskGroupKey {
  if (query !== null) {
    return parseGroup(query);
  }
  return parseGroup(stored);
}

export function calendarDay(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
}

/** A task has a clock time when it is not all-day and the local wall time is not 00:00. */
export function hasTime(dueDate: string | null, timeZone: string, allDay: boolean): boolean {
  if (dueDate === null || allDay) {
    return false;
  }
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  const midnight = (hour === 0 || hour === 24) && minute === 0;
  return !midnight;
}

export function formatDueTime(dueDate: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
    hourCycle: 'h23',
  }).format(new Date(dueDate));
}

export function isOverdue(task: TodayTask, now: Date): boolean {
  return placement(task, now) === 'overdue';
}

export function isDueToday(task: TodayTask, now: Date): boolean {
  return placement(task, now) === 'today';
}

function placement(task: TodayTask, now: Date): 'overdue' | 'today' | 'none' {
  if (task.isSomeday === true || task.status !== 'active') {
    return 'none';
  }
  const today = calendarDay(now.toISOString(), task.timeZone);
  const due = task.dueDate === null ? null : calendarDay(task.dueDate, task.timeZone);
  const start = task.startDate == null ? null : calendarDay(task.startDate, task.timeZone);
  const from = start ?? due;
  if (from === null) {
    return 'none';
  }
  if (due !== null && due < today) {
    return 'overdue';
  }
  const until = due ?? from;
  return from <= today && today <= until ? 'today' : 'none';
}

export function compareTasks(
  left: TodayTask,
  right: TodayTask,
  sort: TaskSortKey,
  direction: TaskSortDir,
): number {
  if (sort === 'title') {
    return applyDir(left.title.localeCompare(right.title), direction);
  }
  if (sort === 'priority') {
    const rank = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
    if (rank !== 0) {
      return applyDir(rank, direction);
    }
  }
  return compareDue(left, right, direction);
}

export function partitionToday(
  tasks: readonly TodayTask[],
  now: Date,
): { overdue: TodayTask[]; today: TodayTask[] } {
  const overdue: TodayTask[] = [];
  const today: TodayTask[] = [];
  for (const task of tasks) {
    if (isOverdue(task, now)) {
      overdue.push(task);
    } else if (isDueToday(task, now)) {
      today.push(task);
    }
  }
  overdue.sort((left, right) => compareTasks(left, right, 'due', 'asc'));
  today.sort((left, right) => compareTasks(left, right, 'due', 'asc'));
  return { overdue, today };
}

/**
 * Priority, tag, list and flat views keep overdue rows inside their group.
 * Date grouping still leads with the overdue block.
 */
export function mergeForGroup(
  parts: { readonly overdue: readonly TodayTask[]; readonly today: readonly TodayTask[] },
  group: TaskGroupKey,
): { readonly overdue: readonly TodayTask[]; readonly grouped: readonly TodayTask[] } {
  if (group === 'due') {
    return { overdue: parts.overdue, grouped: parts.today };
  }
  return { overdue: [], grouped: [...parts.overdue, ...parts.today] };
}

/** Drops completed rows locally so undo can put them back without refetching. */
export function visibleTasks(
  tasks: readonly TodayTask[],
  hiddenIds: ReadonlySet<string>,
): TodayTask[] {
  return tasks.filter((task) => !hiddenIds.has(task.id));
}

export function formatDueDate(
  dueDate: string,
  timeZone: string,
  locale: string,
  labels: { readonly today: string; readonly tomorrow: string },
): string {
  const dueKey = calendarDay(dueDate, timeZone);
  const todayKey = calendarDay(new Date().toISOString(), timeZone);
  if (dueKey === todayKey) {
    return labels.today;
  }
  if (dueKey === shiftDayKey(todayKey, 1)) {
    return labels.tomorrow;
  }
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(new Date(dueDate));
}

export interface TaskWhen {
  readonly date: string | null;
  readonly time: string | null;
  readonly overdue: boolean;
}

/** Today rows show the clock only. Other days show the short date and the clock when there is one. */
export function taskWhen(
  task: TodayTask,
  now: Date,
  locale: string,
  labels: { readonly today: string; readonly tomorrow: string },
): TaskWhen {
  const shown = task.startDate ?? task.dueDate;
  if (shown === null) {
    return { date: null, time: null, overdue: false };
  }
  const overdue = isOverdue(task, now);
  const timed = hasTime(shown, task.timeZone, task.allDay);
  const clock = timed ? formatDueTime(shown, task.timeZone, locale) : null;
  const duration =
    task.durationMinutes == null || task.durationMinutes <= 0
      ? null
      : formatDurationMinutes(task.durationMinutes);
  const time = [clock, duration].filter((part) => part !== null).join(' · ') || null;
  if (!overdue && isDueToday(task, now)) {
    return { date: null, time, overdue: false };
  }
  return {
    date: formatDueDate(shown, task.timeZone, locale, labels),
    time,
    overdue,
  };
}

export function formatDueChip(
  dueDate: string | null,
  timeZone: string,
  allDay: boolean,
  now: Date,
  locale: string,
  labels: { readonly empty: string; readonly today: string },
): { readonly text: string; readonly tone: 'empty' | 'overdue' | 'accent' | 'muted' } {
  if (dueDate === null) {
    return { text: labels.empty, tone: 'empty' };
  }
  const overdue = calendarDay(dueDate, timeZone) < calendarDay(now.toISOString(), timeZone);
  const today = calendarDay(dueDate, timeZone) === calendarDay(now.toISOString(), timeZone);
  const timed = hasTime(dueDate, timeZone, allDay);
  const time = timed ? formatDueTime(dueDate, timeZone, locale) : null;
  const short = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(new Date(dueDate));
  if (overdue) {
    const days = Math.max(
      1,
      Math.round((now.getTime() - new Date(dueDate).getTime()) / (24 * 60 * 60 * 1000)),
    );
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
      days > 60 ? -Math.round(days / 30) : -days,
      days > 60 ? 'month' : 'day',
    );
    return {
      text: time === null ? `${relative}, ${short}` : `${relative}, ${short}, ${time}`,
      tone: 'overdue',
    };
  }
  if (today) {
    const text = time === null ? labels.today : `${labels.today}, ${short}, ${time}`;
    return { text, tone: 'accent' };
  }
  return { text: time === null ? short : `${short}, ${time}`, tone: 'accent' };
}

export function shiftDayKey(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days))
    .toISOString()
    .slice(0, 10);
}

/** Local wall time as a UTC instant. Used when a drop or shortcut sets a day without a clock. */
export function zonedWallTime(
  dayKey: string,
  hour: number,
  minute: number,
  timeZone: string,
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day, hour, minute);
  const corrected = new Date(utc - zoneOffsetMs(new Date(utc), timeZone));
  return new Date(utc - zoneOffsetMs(corrected, timeZone)).toISOString();
}

export function formatDayId(day: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (match === null) {
    return day;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, date)));
}

export function activeTasks(tasks: readonly TodayTask[]): TodayTask[] {
  return tasks.filter((task) => task.status === 'active');
}

export function groupTasks(
  tasks: readonly TodayTask[],
  group: TaskGroupKey,
  sort: TaskSortKey = 'due',
  direction: TaskSortDir = 'asc',
): TodayGroup[] {
  const sorted = [...tasks].sort((left, right) => compareTasks(left, right, sort, direction));
  if (group === 'none') {
    return sorted.length === 0 ? [] : [{ id: 'all', tasks: sorted }];
  }
  if (group === 'priority') {
    return PRIORITY_ORDER.map((priority) => ({
      id: priority,
      tasks: sorted.filter((task) => task.priority === priority),
    })).filter((section) => section.tasks.length > 0);
  }
  const buckets = new Map<string, TodayTask[]>();
  for (const task of sorted) {
    const id = bucketId(task, group);
    const current = buckets.get(id) ?? [];
    current.push(task);
    buckets.set(id, current);
  }
  const sections = [...buckets.entries()].map(([id, section]) => ({ id, tasks: section }));
  if (group === 'due') {
    sections.sort((left, right) => compareDueGroup(left.id, right.id));
  }
  return sections;
}

export function rangeIds(ids: readonly string[], anchor: string, target: string): string[] {
  const start = ids.indexOf(anchor);
  const end = ids.indexOf(target);
  if (start < 0 || end < 0) {
    return [target];
  }
  const [from, to] = start < end ? [start, end] : [end, start];
  return ids.slice(from, to + 1);
}

export function planTaskIds(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || !('task_ids' in value)) {
    return [];
  }
  const ids = value.task_ids;
  if (!Array.isArray(ids)) {
    return [];
  }
  return ids.filter((id): id is string => typeof id === 'string').slice(0, 5);
}

function applyDir(value: number, direction: TaskSortDir): number {
  return direction === 'desc' ? -value : value;
}

function compareDue(left: TodayTask, right: TodayTask, direction: TaskSortDir): number {
  if (left.dueDate === null && right.dueDate === null) {
    return left.title.localeCompare(right.title);
  }
  if (left.dueDate === null) {
    return 1;
  }
  if (right.dueDate === null) {
    return -1;
  }
  const leftDay = calendarDay(left.dueDate, left.timeZone);
  const rightDay = calendarDay(right.dueDate, right.timeZone);
  if (leftDay !== rightDay) {
    return applyDir(leftDay.localeCompare(rightDay), direction);
  }
  const leftTimed = hasTime(left.dueDate, left.timeZone, left.allDay);
  const rightTimed = hasTime(right.dueDate, right.timeZone, right.allDay);
  if (leftTimed !== rightTimed) {
    return leftTimed ? -1 : 1;
  }
  if (leftTimed) {
    return applyDir(left.dueDate.localeCompare(right.dueDate), direction);
  }
  return left.title.localeCompare(right.title);
}

function compareDueGroup(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  if (left === 'none') {
    return 1;
  }
  if (right === 'none') {
    return -1;
  }
  return left.localeCompare(right);
}

function bucketId(task: TodayTask, group: 'due' | 'tag' | 'list'): string {
  if (group === 'due') {
    return task.dueDate === null ? 'none' : calendarDay(task.dueDate, task.timeZone);
  }
  if (group === 'list') {
    return task.projectId;
  }
  return task.tagIds[0] ?? 'none';
}

function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  const asUtc = Date.UTC(
    pick('year'),
    pick('month') - 1,
    pick('day'),
    pick('hour'),
    pick('minute'),
    pick('second'),
  );
  return asUtc - date.getTime();
}
