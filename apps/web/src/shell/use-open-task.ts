import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/** Open a task in the current route's detail pane (TTD-AUD-60). */
export function useOpenTask(): (taskId: string) => void {
  const [, setParams] = useSearchParams();
  return useCallback(
    (taskId: string) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('task', taskId);
          return next;
        },
        { replace: false },
      );
    },
    [setParams],
  );
}

/** Build a same-route task URL for Link/href without leaving the current path. */
export function taskQueryHref(pathname: string, search: string, taskId: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.set('task', taskId);
  const query = params.toString();
  return query.length > 0 ? `${pathname}?${query}` : `${pathname}?task=${taskId}`;
}
