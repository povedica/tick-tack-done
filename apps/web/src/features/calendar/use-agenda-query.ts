import { useInfiniteQuery } from '@tanstack/react-query';
import type { Task } from '@reflexionia/sdk';
import { api } from '../../api';
import { calendarTaskQuery } from './calendar-task-query';
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
    queryKey: ['calendar-agenda', 'auto', origin, timeZone],
    enabled,
    initialPageParam: 0,
    staleTime: 60_000,
    queryFn: async ({ pageParam, signal }): Promise<AgendaPage> => {
      const range = agendaPageRange(origin, pageParam, timeZone);
      signal.throwIfAborted();
      const [tasks, events] = await Promise.all([
        collectTasks(
          (query) => api.listTasks(query),
          calendarTaskQuery(range.startDay, range.endDay),
        ),
        api.calendarEvents(range.from, range.to, 'auto', 'external'),
      ]);
      signal.throwIfAborted();
      return { page: pageParam, range, tasks, events };
    },
    getNextPageParam: (last) => last.page + 1,
    getPreviousPageParam: (first) => first.page - 1,
  });
}
