export type TaskGroupKey = 'priority' | 'due' | 'tag' | 'list';

export interface TodayTask {
  readonly id: string;
  readonly title: string;
  readonly priority: 'none' | 'low' | 'medium' | 'high';
  readonly dueDate: string | null;
  readonly timeZone: string;
  readonly status: 'active' | 'completed' | 'archived';
  readonly projectId: string;
  readonly tagIds: readonly string[];
}

export interface TodayGroup {
  readonly id: string;
  readonly tasks: readonly TodayTask[];
}

const PRIORITY_ORDER = ['high', 'medium', 'low', 'none'] as const;

export function parseGroup(value: string | null): TaskGroupKey {
  switch (value) {
    case 'priority':
    case 'due':
    case 'tag':
    case 'list':
      return value;
    default:
      return 'priority';
  }
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

export function isOverdue(task: TodayTask, now: Date): boolean {
  if (task.dueDate === null || task.status !== 'active') {
    return false;
  }
  return calendarDay(task.dueDate, task.timeZone) < calendarDay(now.toISOString(), task.timeZone);
}

export function isDueToday(task: TodayTask, now: Date): boolean {
  if (task.dueDate === null || task.status !== 'active') {
    return false;
  }
  return calendarDay(task.dueDate, task.timeZone) === calendarDay(now.toISOString(), task.timeZone);
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
  const byDue = (left: TodayTask, right: TodayTask): number =>
    (left.dueDate ?? '').localeCompare(right.dueDate ?? '');
  overdue.sort(byDue);
  today.sort(byDue);
  return { overdue, today };
}

/** Drops completed rows locally so undo can put them back without refetching. */
export function visibleTasks(
  tasks: readonly TodayTask[],
  hiddenIds: ReadonlySet<string>,
): TodayTask[] {
  return tasks.filter((task) => !hiddenIds.has(task.id));
}

export function formatDueDate(dueDate: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(new Date(dueDate));
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

export function groupTasks(tasks: readonly TodayTask[], group: TaskGroupKey): TodayGroup[] {
  if (group === 'priority') {
    return PRIORITY_ORDER.map((priority) => ({
      id: priority,
      tasks: tasks.filter((task) => task.priority === priority),
    })).filter((section) => section.tasks.length > 0);
  }
  const buckets = new Map<string, TodayTask[]>();
  for (const task of tasks) {
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

function bucketId(task: TodayTask, group: Exclude<TaskGroupKey, 'priority'>): string {
  if (group === 'due') {
    return task.dueDate === null ? 'none' : calendarDay(task.dueDate, task.timeZone);
  }
  if (group === 'list') {
    return task.projectId;
  }
  return task.tagIds[0] ?? 'none';
}
