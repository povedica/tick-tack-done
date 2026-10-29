import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { nextMidnight, todayInZone } from './calendar-today';

/** A single date basis for calendar marks, also refreshed when a sleeping tab wakes. */
export function useCalendarToday(timeZone?: string): string {
  const account = useQuery({
    queryKey: ['me'],
    queryFn: () => api.getMe(),
    notifyOnChangeProps: ['data'],
  });
  const zone = timeZone ?? account.data?.time_zone ?? 'Europe/Madrid';
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number;
    function refresh() {
      const current = new Date();
      setNow((previous) =>
        todayInZone(previous, zone) === todayInZone(current, zone) ? previous : current,
      );
      window.clearTimeout(timer);
      timer = window.setTimeout(
        refresh,
        Math.max(1, nextMidnight(current, zone) - current.getTime()),
      );
    }
    refresh();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [zone]);
  return todayInZone(now, zone);
}
