import type { ListTasksQuery, Task, TaskPage } from '@reflexionia/sdk';
import { partitionToday, type TodayTask } from './groups';

const PAGE_LIMIT = 100;
const MAX_PAGES = 20;
const WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

export interface TaskReader {
  listTasks(query?: ListTasksQuery): Promise<TaskPage>;
}

export function dueWindow(now: Date): { readonly dueAfter: string; readonly dueBefore: string } {
  return {
    dueAfter: new Date(now.getTime() - WINDOW_MS).toISOString(),
    dueBefore: new Date(now.getTime() + WINDOW_MS).toISOString(),
  };
}

export function toTodayTask(task: Task): TodayTask {
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    dueDate: task.due_date,
    startDate: task.start_date,
    durationMinutes: task.duration_minutes,
    isSomeday: 'is_someday' in task && task.is_someday,
    eveningOnly: 'evening_only' in task && task.evening_only,
    timeZone: task.time_zone,
    allDay: task.is_all_day,
    // The list payload has no reminder collection; the row still renders the bell when set.
    hasReminder: false,
    checklistDone: task.checklist_progress.completed,
    checklistTotal: task.checklist_progress.total,
    hasContent: task.content.trim().length > 0,
    hasRepeat: task.repeat_rule !== null,
    attachmentCount: 0,
    linkCount: task.link_count ?? 0,
    source: task.source,
    status: task.status,
    projectId: task.project_id,
    tagIds: task.tag_ids,
  };
}

export async function collectTasks(
  list: TaskReader['listTasks'],
  query: ListTasksQuery,
): Promise<Task[]> {
  const items: Task[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await list({
      ...query,
      ...(cursor === undefined ? {} : { cursor }),
    });
    items.push(...result.items);
    if (result.next_cursor === null) {
      return items;
    }
    cursor = result.next_cursor;
  }
  return items;
}

/** Overdue tasks plus those due today. The daily plan is not part of this read. */
export async function loadTodayTasks(client: TaskReader, now: Date): Promise<TodayTask[]> {
  const window = dueWindow(now);
  const list = (query?: ListTasksQuery): Promise<TaskPage> => client.listTasks(query);
  const [overdue, nearby] = await Promise.all([
    collectTasks(list, {
      status: 'active',
      overdue: true,
      limit: PAGE_LIMIT,
      sort: 'due',
    }),
    collectTasks(list, {
      status: 'active',
      limit: PAGE_LIMIT,
      sort: 'due',
      dueAfter: window.dueAfter,
      dueBefore: window.dueBefore,
    }),
  ]);
  const byId = new Map<string, TodayTask>();
  for (const row of [...overdue, ...nearby]) {
    if (row.kind !== 'task' || byId.has(row.id)) {
      continue;
    }
    byId.set(row.id, toTodayTask(row));
  }
  const parts = partitionToday([...byId.values()], now);
  return [...parts.overdue, ...parts.today];
}
