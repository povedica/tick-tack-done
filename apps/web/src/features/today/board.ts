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
    timeZone: task.time_zone,
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
