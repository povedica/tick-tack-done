import { useInfiniteQuery } from '@tanstack/react-query';
import type { Task } from '@reflexionia/sdk';
import { api } from '../../api';
import { collectTasks } from '../today/board';
import { agendaPageRange } from './agenda-range';

export interface AgendaPage {
  readonly page: number;
  readonly range: ReturnType<typeof agendaPageRange>;
  readonly tasks: Task[];
  readonly events: Awaited<ReturnType<typeof api.calendarEvents>>;
}
export function useAgendaQuery(origin: string, timeZone: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['calendar-agenda', origin, timeZone],
    enabled,
    initialPageParam: 0,
    staleTime: 60_000,
    queryFn: async ({ pageParam, signal }): Promise<AgendaPage> => {
      const range = agendaPageRange(origin, pageParam, timeZone);
      signal.throwIfAborted();
      const [tasks, events] = await Promise.all([
        collectTasks((query) => api.listTasks(query), {
          status: 'active',
          limit: 100,
          sort: 'due',
          dueAfter: new Date(Date.parse(range.from) - 1).toISOString(),
          dueBefore: range.to,
        }),
        api.calendarEvents(range.from, range.to),
      ]);
      signal.throwIfAborted();
      return { page: pageParam, range, tasks, events };
    },
    getNextPageParam: (last) => last.page + 1,
    getPreviousPageParam: (first) => first.page - 1,
  });
}
