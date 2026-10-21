import type { QueryClient } from '@tanstack/react-query';
import type { SmartListPage, ViewPage } from '@reflexionia/sdk';
import { api } from '../../api';
import { refreshTaskSurfaces } from './refresh';

/**
 * TTD-AUD-16: remove the row and trash counter immediately; roll back if DELETE fails.
 */
export async function purgeTrashTask(queryClient: QueryClient, taskId: string): Promise<void> {
  const previousTasks = queryClient.getQueriesData<ViewPage>({
    queryKey: ['smart-list-tasks', 'trash'],
  });
  const previousLists = queryClient.getQueriesData<SmartListPage>({ queryKey: ['smart-lists'] });

  queryClient.setQueriesData<ViewPage>({ queryKey: ['smart-list-tasks', 'trash'] }, (page) =>
    page === undefined ? page : removeTaskFromView(page, taskId),
  );
  queryClient.setQueriesData<SmartListPage>({ queryKey: ['smart-lists'] }, (page) =>
    page === undefined ? page : decrementTrashCount(page),
  );

  try {
    await api.purgeTask(taskId);
    await refreshTaskSurfaces(queryClient);
  } catch (error) {
    for (const [key, data] of previousTasks) {
      queryClient.setQueryData(key, data);
    }
    for (const [key, data] of previousLists) {
      queryClient.setQueryData(key, data);
    }
    throw error;
  }
}

export function removeTaskFromView(page: ViewPage, taskId: string): ViewPage {
  return {
    ...page,
    groups: page.groups.map((group) => ({
      ...group,
      tasks: group.tasks.filter((task) => task.id !== taskId),
    })),
  };
}

export function decrementTrashCount(page: SmartListPage): SmartListPage {
  return {
    ...page,
    items: page.items.map((item) =>
      item.key === 'trash'
        ? { ...item, task_count: Math.max(0, (item.task_count ?? 0) - 1) }
        : item,
    ),
  };
}
