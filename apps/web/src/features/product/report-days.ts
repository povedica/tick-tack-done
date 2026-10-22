import { shiftDayKey } from '../today/groups';
export interface ReportDay {
  readonly date: string;
  readonly completed: number;
  readonly created: number;
}

function rows(value: unknown): ReportDay[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const row = entry as Record<string, unknown>;
    return typeof row.date === 'string' &&
      typeof row.completed === 'number' &&
      typeof row.created === 'number'
      ? [{ date: row.date, completed: row.completed, created: row.created }]
      : [];
  });
}
export function reportDays(
  saved: unknown,
  live: unknown,
  ongoing: boolean,
  start: string,
  today: string,
): ReportDay[] {
  const stored = rows(saved);
  if (!ongoing) return stored.length === 7 ? stored : [];
  const current = rows(live);
  const source = current.length ? current : stored;
  if (!source.length) return [];
  const byDate = new Map(source.map((day) => [day.date, day]));
  return Array.from({ length: 7 }, (_, index) => {
    const date = shiftDayKey(start, index);
    return date <= today
      ? (byDate.get(date) ?? { date, completed: 0, created: 0 })
      : { date, completed: 0, created: 0 };
  });
}
