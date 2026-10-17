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
  return [...buckets.entries()].map(([id, section]) => ({ id, tasks: section }));
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
