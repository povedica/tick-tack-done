const TASK_KEYS = [
  'ref',
  'title',
  'notes',
  'status',
  'priority',
  'start_date',
  'due_date',
  'all_day',
  'completed_at',
  'tags',
  'subtasks',
  'checklist',
] as const;

const LIST_KEYS = ['name', 'generated_at', 'tasks', 'truncated'] as const;

export interface PublicTaskInput {
  readonly title: string;
  readonly content: string;
  readonly status: 'active' | 'completed';
  readonly priority: 'none' | 'low' | 'medium' | 'high';
  readonly startDate: Date | null;
  readonly dueDate: Date | null;
  readonly isAllDay: boolean;
  readonly completedAt: Date | null;
  readonly tags: readonly { name: string; color: string | null }[];
  readonly subtasks: readonly { title: string; status: 'active' | 'completed' }[];
  readonly checklist: readonly { title: string; done: boolean }[];
}

export interface PublicListBody {
  readonly name: string;
  readonly generated_at: string;
  readonly truncated?: boolean;
  readonly tasks: readonly PublicTaskBody[];
}

export interface PublicTaskBody {
  readonly ref: string;
  readonly title: string;
  readonly notes: string | null;
  readonly status: 'active' | 'completed';
  readonly priority: 'none' | 'low' | 'medium' | 'high';
  readonly start_date: string | null;
  readonly due_date: string | null;
  readonly all_day: boolean;
  readonly completed_at: string | null;
  readonly tags: readonly { name: string; color: string | null }[];
  readonly subtasks: readonly { title: string; status: 'active' | 'completed' }[];
  readonly checklist: readonly { title: string; done: boolean }[];
}

/** COMP-29. Hand-mapped fields. Never spreads a database row. */
export function toPublicList(
  name: string,
  tasks: readonly PublicTaskInput[],
  includeNotes: boolean,
  truncated: boolean,
  now: Date,
): PublicListBody {
  const body: PublicListBody = {
    name,
    generated_at: now.toISOString(),
    tasks: tasks.map((task, index) => toTask(task, index, includeNotes)),
  };
  if (truncated) {
    return { ...body, truncated: true };
  }
  return body;
}

export function publicListKeys(body: PublicListBody): readonly string[] {
  return Object.keys(body);
}

export function assertPublicShape(body: PublicListBody): void {
  const listKeys = new Set<string>(LIST_KEYS);
  for (const key of Object.keys(body)) {
    if (!listKeys.has(key)) {
      throw new Error(`unexpected list key ${key}`);
    }
  }
  const taskKeys = new Set<string>(TASK_KEYS);
  for (const task of body.tasks) {
    for (const key of Object.keys(task)) {
      if (!taskKeys.has(key)) {
        throw new Error(`unexpected task key ${key}`);
      }
    }
  }
}

function toTask(task: PublicTaskInput, index: number, includeNotes: boolean): PublicTaskBody {
  return {
    ref: `t${String(index + 1)}`,
    title: task.title,
    notes: includeNotes ? task.content : null,
    status: task.status,
    priority: task.priority,
    start_date: task.startDate?.toISOString() ?? null,
    due_date: task.dueDate?.toISOString() ?? null,
    all_day: task.isAllDay,
    completed_at: task.completedAt?.toISOString() ?? null,
    tags: task.tags.map((tag) => ({ name: tag.name, color: tag.color })),
    subtasks: task.subtasks.map((child) => ({ title: child.title, status: child.status })),
    checklist: task.checklist.map((item) => ({ title: item.title, done: item.done })),
  };
}
