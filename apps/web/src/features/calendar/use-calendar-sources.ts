import { useEffect } from 'react';
import { useSearchParams } from 'react-router';

const keys = ['lists', 'tags', 'cals', 'filters'] as const;
export function useCalendarSources() {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (keys.some((key) => params.has(key))) return;
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('ttd.calendar.filters') ?? '{}');
      if (typeof saved !== 'object' || saved === null) return;
      const next = new URLSearchParams(params);
      for (const key of keys) {
        const value = (saved as Record<string, unknown>)[key];
        if (typeof value === 'string') next.set(key, value);
      }
      if (next.toString() !== params.toString()) setParams(next, { replace: true });
    } catch {
      /* A damaged preference never prevents opening the calendar. */
    }
  }, []);
  const change = (updates: Partial<Record<(typeof keys)[number], string | null>>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    localStorage.setItem(
      'ttd.calendar.filters',
      JSON.stringify(Object.fromEntries(keys.map((key) => [key, next.get(key)]))),
    );
    setParams(next);
  };
  return { params, change };
}
