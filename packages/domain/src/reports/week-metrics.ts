import { dayKey } from '../stats/aggregate';

export interface WeekDayMetric {
  readonly date: string;
  readonly completed: number;
  readonly created: number;
}

export function bucketWeek(
  start: string,
  rows: readonly { readonly createdAt: string; readonly completedAt: string | null }[],
  timeZone = 'UTC',
  until?: string,
): WeekDayMetric[] {
  const days: { date: string; completed: number; created: number }[] = Array.from(
    { length: 7 },
    (_, index) => {
      const date = new Date(Date.parse(start) + index * 24 * 60 * 60 * 1000);
      return { date: date.toISOString().slice(0, 10), completed: 0, created: 0 };
    },
  );
  const index = new Map(days.map((day, position) => [day.date, position]));
  for (const row of rows) {
    const created = index.get(dayKey(row.createdAt, timeZone) ?? '');
    if (
      created !== undefined &&
      (until === undefined || Date.parse(row.createdAt) < Date.parse(until))
    ) {
      const day = days[created];
      if (day !== undefined) {
        day.created += 1;
      }
    }
    if (
      row.completedAt !== null &&
      (until === undefined || Date.parse(row.completedAt) < Date.parse(until))
    ) {
      const completed = index.get(dayKey(row.completedAt, timeZone) ?? '');
      if (completed !== undefined) {
        const day = days[completed];
        if (day !== undefined) {
          day.completed += 1;
        }
      }
    }
  }
  return days;
}
