export interface WeekDayMetric {
  readonly date: string;
  readonly completed: number;
  readonly created: number;
}

export function bucketWeek(
  start: Date,
  rows: readonly { readonly createdAt: Date; readonly completedAt: Date | null }[],
): WeekDayMetric[] {
  const days: { date: string; completed: number; created: number }[] = Array.from(
    { length: 7 },
    (_, index) => {
      const date = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
      return { date: date.toISOString().slice(0, 10), completed: 0, created: 0 };
    },
  );
  const index = new Map(days.map((day, position) => [day.date, position]));
  for (const row of rows) {
    const created = index.get(row.createdAt.toISOString().slice(0, 10));
    if (created !== undefined) {
      const day = days[created];
      if (day !== undefined) {
        day.created += 1;
      }
    }
    if (row.completedAt !== null) {
      const completed = index.get(row.completedAt.toISOString().slice(0, 10));
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
