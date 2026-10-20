export type RangeKey = 'today' | 'week' | 'month' | 'year' | 'custom';

function addCalendarDays(day: string, delta: number): string | null {
  const [y, m, d] = day.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return `${String(date.getUTCFullYear())}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function validDay(day: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) &&
    new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day
  );
}

const STORAGE_KEY = 'tick-tack-done.stats.range';

export function todayKey(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function mondayOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) {
    return day;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = date.getUTCDay();
  const offset = weekday === 0 ? 6 : weekday - 1;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

export function rangeFor(
  key: RangeKey,
  timeZone: string,
  custom?: { from: string; to: string },
): { from: string; to: string } {
  const today = todayKey(timeZone);
  if (custom && validDay(custom.from) && validDay(custom.to) && custom.from <= custom.to)
    return custom;
  if (key === 'today') {
    return { from: today, to: today };
  }
  if (key === 'week') {
    const from = mondayOf(today);
    const to = addCalendarDays(from, 6) ?? today;
    return { from, to };
  }
  if (key === 'month') {
    const from = `${today.slice(0, 7)}-01`;
    const [y, m] = from.split('-').map(Number);
    const last = new Date(Date.UTC(y ?? 2026, m ?? 1, 0)).getUTCDate();
    return { from, to: `${today.slice(0, 7)}-${String(last).padStart(2, '0')}` };
  }
  if (key === 'year') {
    const year = today.slice(0, 4);
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  return { from: custom?.from ?? today, to: custom?.to ?? today };
}

export function shiftRange(
  key: RangeKey,
  from: string,
  to: string,
  direction: -1 | 1,
): { from: string; to: string } {
  const days =
    Math.round(
      (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
        (24 * 60 * 60 * 1000),
    ) + 1;
  if (key === 'month') {
    const [y, m] = from.split('-').map(Number);
    const date = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1 + direction, 1));
    const nextFrom = date.toISOString().slice(0, 10);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    return {
      from: nextFrom,
      to: `${nextFrom.slice(0, 7)}-${String(last).padStart(2, '0')}`,
    };
  }
  if (key === 'year') {
    const year = Number(from.slice(0, 4)) + direction;
    return { from: `${String(year)}-01-01`, to: `${String(year)}-12-31` };
  }
  const nextFrom = addCalendarDays(from, direction * days) ?? from;
  const nextTo = addCalendarDays(to, direction * days) ?? to;
  return { from: nextFrom, to: nextTo };
}

export function readStoredRange(): RangeKey {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (
      value === 'today' ||
      value === 'week' ||
      value === 'month' ||
      value === 'year' ||
      value === 'custom'
    ) {
      return value;
    }
  } catch {
    /* ignore */
  }
  return 'week';
}

export function writeStoredRange(value: RangeKey): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

export function formatHumanDay(day: string, locale = 'es-ES'): string {
  const [y, m, d] = day.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) {
    return day;
  }
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(minutes % 60);
  if (hours === 0) {
    return `${rest} min`;
  }
  return `${String(hours)} h ${rest} min`;
}

const STATE_KEY = 'tick-tack-done.stats.state';
export function readStatsState(): string {
  try {
    return localStorage.getItem(STATE_KEY) ?? '';
  } catch {
    return '';
  }
}
export function writeStatsState(search: string): void {
  try {
    localStorage.setItem(STATE_KEY, search);
  } catch {
    /* Storage is optional. */
  }
}
