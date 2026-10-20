import type { ListTasksQuery, Task, TaskPage } from '@reflexionia/sdk';
import { collectTasks, toTodayTask } from '../today/board';
import { partitionToday } from '../today/groups';
import type { MatrixScope } from './scope';

const PAGE_LIMIT = 100;

/** Notes and subtasks stay out of the matrix. Hoy keeps overdue rows plus tasks due today. */
export function tasksForMatrixScope(tasks: readonly Task[], scope: MatrixScope, now: Date): Task[] {
  const cards = tasks.filter(
    (task) => task.kind === 'task' && task.parent_id === null && task.status === 'active',
  );
  if (scope.kind !== 'today') {
    return cards;
  }
  const parts = partitionToday(cards.map(toTodayTask), now);
  const ids = new Set([...parts.overdue, ...parts.today].map((task) => task.id));
  return cards.filter((task) => ids.has(task.id));
}

export async function loadMatrixTasks(
  list: (query?: ListTasksQuery) => Promise<TaskPage>,
  scope: MatrixScope,
  now: Date,
): Promise<Task[]> {
  const tasks =
    scope.kind === 'today'
      ? await loadTodayWindow(list, now)
      : await collectTasks(list, {
          status: 'active',
          limit: PAGE_LIMIT,
          ...(scope.kind === 'list' ? { listId: scope.listId } : {}),
        });
  return tasksForMatrixScope(tasks, scope, now);
}

async function loadTodayWindow(
  list: (query?: ListTasksQuery) => Promise<TaskPage>,
  now: Date,
): Promise<Task[]> {
  const windowMs = 2 * 24 * 60 * 60 * 1000;
  const [overdue, nearby] = await Promise.all([
    collectTasks(list, { status: 'active', overdue: true, limit: PAGE_LIMIT, sort: 'due' }),
    collectTasks(list, {
      status: 'active',
      limit: PAGE_LIMIT,
      sort: 'due',
      dueAfter: new Date(now.getTime() - windowMs).toISOString(),
      dueBefore: new Date(now.getTime() + windowMs).toISOString(),
    }),
  ]);
  const byId = new Map<string, Task>();
  for (const task of [...overdue, ...nearby]) {
    byId.set(task.id, task);
  }
  return [...byId.values()];
}
