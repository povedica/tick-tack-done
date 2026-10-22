import type { QueryClient } from '@tanstack/react-query';

/** Counters always refresh. Mounted lists refresh; idle caches stay until they open. */
export async function refreshTaskSurfaces(queryClient: QueryClient): Promise<void> {
  const active = { refetchType: 'active' as const };
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['overdue-count'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['review-weekly'] }),
    queryClient.invalidateQueries({ queryKey: ['review-daily'] }),
    queryClient.invalidateQueries({ queryKey: ['stats'] }),
    queryClient.invalidateQueries({ queryKey: ['achievements'] }),
    queryClient.invalidateQueries({ queryKey: ['smart-lists'] }),
    queryClient.invalidateQueries({ queryKey: ['today-tasks'], ...active }),
    queryClient.invalidateQueries({ queryKey: ['inbox-tasks'], ...active }),
    queryClient.invalidateQueries({ queryKey: ['project-tasks'], ...active }),
    queryClient.invalidateQueries({ queryKey: ['smart-list-tasks'], ...active }),
    queryClient.invalidateQueries({ queryKey: ['filter-tasks'], ...active }),
    queryClient.invalidateQueries({ queryKey: ['tag-tasks'], ...active }),
    queryClient.invalidateQueries({ queryKey: ['calendar-tasks'], ...active }),
    queryClient.invalidateQueries({ queryKey: ['calendar-agenda'], ...active }),
    queryClient.invalidateQueries({ queryKey: ['calendar-start-tasks'], ...active }),
    queryClient.invalidateQueries({ queryKey: ['calendar-events'], ...active }),
    queryClient.invalidateQueries({ queryKey: ['search'], ...active }),
    queryClient.invalidateQueries({ queryKey: ['search-page'], ...active }),
    queryClient.invalidateQueries({ queryKey: ['task'], ...active }),
    queryClient.invalidateQueries({ queryKey: ['matrix-tasks'], ...active }),
  ]);
}
