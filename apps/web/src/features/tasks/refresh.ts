import type { QueryClient } from '@tanstack/react-query';

/** Lists and sidebar counters share these caches. A mutation refreshes both. */
export async function refreshTaskSurfaces(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['today-tasks'] }),
    queryClient.invalidateQueries({ queryKey: ['inbox-tasks'] }),
    queryClient.invalidateQueries({ queryKey: ['project-tasks'] }),
    queryClient.invalidateQueries({ queryKey: ['smart-list-tasks'] }),
    queryClient.invalidateQueries({ queryKey: ['filter-tasks'] }),
    queryClient.invalidateQueries({ queryKey: ['smart-lists'] }),
    queryClient.invalidateQueries({ queryKey: ['projects'] }),
    queryClient.invalidateQueries({ queryKey: ['tags'] }),
    queryClient.invalidateQueries({ queryKey: ['search'] }),
    queryClient.invalidateQueries({ queryKey: ['task'] }),
  ]);
}
