import type { Prisma } from '@prisma/client';
import { checklistProgress, type ArrangedTask, type FilterSubject } from '@reflexionia/domain';
import { iso } from '../http/json.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { Tx } from '../prisma/tx.js';

const include = {
  tags: { include: { tag: { select: { id: true, name: true, deletedAt: true } } } },
  column: { select: { id: true, name: true, sortOrder: true, deletedAt: true } },
  project: { select: { name: true, folderId: true } },
  checklist: {
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' as const },
    select: { id: true, title: true, status: true },
  },
} satisfies Prisma.TaskInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof include }>;

export interface ViewChecklistJson {
  id: string;
  title: string;
  status: 'active' | 'completed';
}

export interface ViewTagJson {
  id: string;
  name: string;
}

export interface ViewTaskJson {
  id: string;
  title: string;
  content: string;
  kind: 'task' | 'note';
  status: 'active' | 'completed' | 'archived' | 'cancelled';
  priority: 'none' | 'low' | 'medium' | 'high';
  due_date: string | null;
  start_date: string | null;
  duration_minutes: number | null;
  is_all_day: boolean;
  time_zone: string;
  project_id: string;
  project_name: string;
  column_id: string | null;
  column_name: string | null;
  tags: ViewTagJson[];
  checklist: ViewChecklistJson[];
  checklist_progress: { completed: number; total: number };
  sort_order: string;
  assignee_id: string | null;
  created_at: string;
  completed_at: string | null;
  repeat_rule: string | null;
  source: 'manual' | 'import' | 'api' | 'mcp' | 'automation' | 'plugin';
  deleted_at: string | null;
}

export interface ViewTask extends ArrangedTask {
  readonly startDate: string | null;
  readonly durationMinutes: number | null;
  readonly content: string;
  readonly kind: 'task' | 'note';
  readonly status: 'active' | 'completed' | 'archived' | 'cancelled';
  readonly isAllDay: boolean;
  readonly zone: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly tags: readonly ViewTagJson[];
  readonly checklist: readonly ViewChecklistJson[];
  readonly assigneeId: string | null;
  readonly deletedAt: string | null;
  readonly completedAt: string | null;
  readonly repeatRule: string | null;
  readonly source: 'manual' | 'import' | 'api' | 'mcp' | 'automation' | 'plugin';
  readonly subject: FilterSubject;
}

export async function loadViewTasks(
  db: PrismaService | Tx,
  where: Prisma.TaskWhereInput,
): Promise<ViewTask[]> {
  const rows = await db.task.findMany({
    where,
    include,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  return rows.map(toViewTask);
}

export function toViewJson(task: ViewTask): ViewTaskJson {
  const progress = checklistProgress(task.checklist);
  return {
    id: task.id,
    title: task.title,
    content: task.content,
    kind: task.kind,
    status: task.status,
    priority: asPriority(task.priority),
    due_date: task.dueDate,
    start_date: task.startDate,
    duration_minutes: task.durationMinutes,
    is_all_day: task.isAllDay,
    time_zone: task.zone,
    project_id: task.projectId,
    project_name: task.projectName,
    column_id: task.columnId,
    column_name: task.columnName,
    tags: [...task.tags],
    checklist: [...task.checklist],
    checklist_progress: progress,
    sort_order: task.sortOrder,
    assignee_id: task.assigneeId,
    created_at: task.createdAt,
    completed_at: task.completedAt,
    repeat_rule: task.repeatRule,
    source: task.source,
    deleted_at: task.deletedAt,
  };
}

function asPriority(value: string): ViewTaskJson['priority'] {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
  return 'none';
}

function toViewTask(row: TaskRow): ViewTask {
  const tags = row.tags
    .filter((link) => link.tag.deletedAt === null)
    .map((link) => ({ id: link.tag.id, name: link.tag.name }));
  const column = row.column !== null && row.column.deletedAt === null ? row.column : null;
  const checklist = row.checklist.map((item) => ({
    id: item.id,
    title: item.title,
    status: item.status,
  }));
  const dueDate = iso(row.dueDate);
  const createdAt = iso(row.createdAt) ?? '';
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    kind: row.kind,
    status: row.status,
    priority: row.priority,
    dueDate,
    startDate: iso(row.startDate),
    durationMinutes: row.durationMinutes,
    isAllDay: row.isAllDay,
    zone: row.timeZone,
    projectId: row.projectId,
    projectName: row.project.name,
    columnId: column?.id ?? null,
    columnName: column?.name ?? null,
    columnSortOrder: column === null ? null : column.sortOrder.toString(),
    tagNames: tags.map((tag) => tag.name),
    tags,
    checklist,
    assigneeId: row.assigneeId,
    deletedAt: iso(row.deletedAt),
    completedAt: iso(row.completedAt),
    repeatRule: row.repeatRule,
    source: row.source,
    createdAt,
    sortOrder: row.sortOrder.toString(),
    subject: {
      listId: row.projectId,
      folderId: row.project.folderId,
      tagIds: tags.map((tag) => tag.id),
      tagNames: tags.map((tag) => tag.name),
      dueDate,
      startDate: iso(row.startDate),
      isAllDay: row.isAllDay,
      timeZone: row.timeZone,
      priority: row.priority,
      title: row.title,
      content: row.content,
      status: row.status,
      assigneeId: row.assigneeId,
      deleted: row.deletedAt !== null,
      createdAt,
    },
  };
}
