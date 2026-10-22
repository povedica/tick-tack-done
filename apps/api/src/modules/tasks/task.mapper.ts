import { checklistProgress } from '@reflexionia/domain';
import { iso } from '../../http/json.js';

export interface TaskRow {
  id: string;
  projectId: string;
  parentId: string | null;
  columnId: string | null;
  title: string;
  content: string;
  kind: 'task' | 'note';
  status: 'active' | 'completed' | 'archived' | 'cancelled';
  priority: 'none' | 'low' | 'medium' | 'high';
  isAllDay: boolean;
  startDate: Date | null;
  dueDate: Date | null;
  timeZone: string;
  durationMinutes: number | null;
  isSomeday: boolean;
  eveningOnly: boolean;
  repeatRule: string | null;
  repeatFrom: 'due_date' | 'completion_date';
  seriesId: string | null;
  sortOrder: bigint;
  assigneeId: string | null;
  createdById: string;
  completedAt: Date | null;
  source: 'manual' | 'import' | 'api' | 'mcp' | 'automation' | 'plugin';
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  tags?: readonly { tagId: string }[];
}

export interface ChecklistRow {
  id: string;
  title: string;
  status: 'active' | 'completed';
  sortOrder: bigint;
  startDate: Date | null;
  dueDate: Date | null;
  isAllDay: boolean;
  timeZone: string;
  completedAt: Date | null;
}

export interface TaskSummaryJson {
  id: string;
  project_id: string;
  parent_id: string | null;
  column_id: string | null;
  title: string;
  content: string;
  kind: 'task' | 'note';
  status: 'active' | 'completed' | 'archived' | 'cancelled';
  priority: 'none' | 'low' | 'medium' | 'high';
  is_all_day: boolean;
  start_date: string | null;
  due_date: string | null;
  time_zone: string;
  duration_minutes: number | null;
  is_someday: boolean;
  evening_only: boolean;
  repeat_rule: string | null;
  repeat_from: 'due_date' | 'completion_date';
  series_id: string | null;
  sort_order: string;
  tag_ids: string[];
  assignee_id: string | null;
  created_by: string;
  completed_at: string | null;
  source: string;
  version: number;
  checklist_progress: { completed: number; total: number };
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ChecklistItemJson {
  id: string;
  task_id: string;
  title: string;
  status: 'active' | 'completed';
  sort_order: string;
  start_date: string | null;
  due_date: string | null;
  is_all_day: boolean;
  time_zone: string;
  completed_at: string | null;
}

export function toTaskSummary(
  row: TaskRow,
  progress: { completed: number; total: number },
): TaskSummaryJson {
  return {
    id: row.id,
    project_id: row.projectId,
    parent_id: row.parentId,
    column_id: row.columnId,
    title: row.title,
    content: row.content,
    kind: row.kind,
    status: row.status,
    priority: row.priority,
    is_all_day: row.isAllDay,
    start_date: iso(row.startDate),
    due_date: iso(row.dueDate),
    time_zone: row.timeZone,
    duration_minutes: row.durationMinutes,
    is_someday: row.isSomeday,
    evening_only: row.eveningOnly,
    repeat_rule: row.repeatRule,
    repeat_from: row.repeatFrom,
    series_id: row.seriesId,
    sort_order: row.sortOrder.toString(),
    tag_ids: (row.tags ?? []).map((tag) => tag.tagId),
    assignee_id: row.assigneeId,
    created_by: row.createdById,
    completed_at: iso(row.completedAt),
    source: row.source,
    version: row.version,
    checklist_progress: progress,
    created_at: iso(row.createdAt) ?? '',
    updated_at: iso(row.updatedAt) ?? '',
    deleted_at: iso(row.deletedAt),
  };
}

export function toChecklistJson(taskId: string, row: ChecklistRow): ChecklistItemJson {
  return {
    id: row.id,
    task_id: taskId,
    title: row.title,
    status: row.status,
    sort_order: row.sortOrder.toString(),
    start_date: iso(row.startDate),
    due_date: iso(row.dueDate),
    is_all_day: row.isAllDay,
    time_zone: row.timeZone,
    completed_at: iso(row.completedAt),
  };
}

export function progressOf(items: readonly { status: 'active' | 'completed' }[]): {
  completed: number;
  total: number;
} {
  return checklistProgress(items);
}
