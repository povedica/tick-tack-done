import type { Task, ViewPage } from '@reflexionia/sdk';

export interface RowModel {
  readonly id: string;
  readonly title: string;
  readonly priority: 'none' | 'low' | 'medium' | 'high';
  readonly dueDate: string | null;
  readonly timeZone: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly columnId: string | null;
  readonly tags: readonly {
    readonly id: string;
    readonly name: string;
    readonly color: string | null;
  }[];
  readonly checklist: { readonly completed: number; readonly total: number };
  readonly kind: 'task' | 'note';
  readonly status: string;
  readonly repeat: boolean;
  readonly source: string;
  readonly content: string;
  readonly completedAt: string | null;
}

type ViewTask = ViewPage['groups'][number]['tasks'][number];

export function progressOf(value: unknown): { completed: number; total: number } {
  if (typeof value !== 'object' || value === null) {
    return { completed: 0, total: 0 };
  }
  const row = value as { completed?: unknown; total?: unknown };
  if (typeof row.completed === 'number' && typeof row.total === 'number') {
    return { completed: row.completed, total: row.total };
  }
  return { completed: 0, total: 0 };
}

export function rowFromTask(
  task: Task,
  names: ReadonlyMap<string, string>,
  tags: ReadonlyMap<string, string>,
): RowModel {
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    dueDate: task.due_date,
    timeZone: task.time_zone,
    projectId: task.project_id,
    projectName: names.get(task.project_id) ?? '',
    columnId: task.column_id,
    tags: namedTags(task.tag_ids, tags),
    checklist: progressOf(task.checklist_progress),
    kind: task.kind,
    status: task.status,
    repeat: hasRepeat(task.repeat_rule),
    source: task.source,
    content: task.content,
    completedAt: task.completed_at,
  };
}

export function rowFromView(task: ViewTask): RowModel {
  const tags = Array.isArray(task.tags) ? task.tags : [];
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    dueDate: task.due_date,
    timeZone: task.time_zone,
    projectId: task.project_id,
    projectName: task.project_name,
    columnId: task.column_id,
    tags: tags.map((tag) => ({ id: tag.id, name: tag.name, color: colorOf(tag) })),
    checklist: progressOf(task.checklist_progress),
    kind: task.kind,
    status: task.status,
    repeat: hasRepeat(task.repeat_rule),
    source: typeof task.source === 'string' ? task.source : '',
    content: typeof task.content === 'string' ? task.content : '',
    completedAt: task.completed_at,
  };
}

function hasRepeat(rule: string | null | undefined): boolean {
  return typeof rule === 'string' && rule.length > 0;
}

function namedTags(ids: readonly string[], tags: ReadonlyMap<string, string>): RowModel['tags'] {
  return ids.flatMap((id) => {
    const name = tags.get(id);
    if (name === undefined || name === id) {
      return [];
    }
    return [{ id, name, color: null }];
  });
}

function colorOf(value: object): string | null {
  if (!('color' in value)) {
    return null;
  }
  return typeof value.color === 'string' ? value.color : null;
}

export function rowsFromView(page: ViewPage | undefined): RowModel[] {
  if (page === undefined) {
    return [];
  }
  return page.groups.flatMap((group) => group.tasks.map(rowFromView));
}

export function isOverdue(due: string | null, now: Date): boolean {
  if (due === null) {
    return false;
  }
  return new Date(due).getTime() < now.getTime();
}

export function isSameDay(due: string | null, now: Date, timeZone: string): boolean {
  if (due === null) {
    return false;
  }
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return format.format(new Date(due)) === format.format(now);
}

export function smartApiKey(routeKey: string): string {
  switch (routeKey) {
    case 'next7':
      return 'next_7_days';
    case 'no-date':
      return 'no_date';
    case 'recent':
      return 'recently_added';
    case 'assigned':
      return 'assigned_to_me';
    default:
      return routeKey;
  }
}

export function smartPath(key: string): string {
  switch (key) {
    case 'today':
      return '/today';
    case 'inbox':
      return '/inbox';
    case 'next_7_days':
      return '/smart/next7';
    case 'no_date':
      return '/smart/no-date';
    case 'recently_added':
      return '/smart/recent';
    case 'assigned_to_me':
      return '/smart/assigned';
    default:
      return `/smart/${key}`;
  }
}

export type MatrixQuadrant = 'do' | 'schedule' | 'delegate' | 'drop';

export function quadrantOf(
  priority: RowModel['priority'],
  dueDate: string | null,
  now: Date,
): MatrixQuadrant {
  const urgent =
    dueDate !== null && new Date(dueDate).getTime() - now.getTime() <= 24 * 60 * 60 * 1000;
  const important = priority === 'high' || priority === 'medium';
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
