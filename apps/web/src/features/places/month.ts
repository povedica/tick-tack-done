import { calendarDateKey } from '@reflexionia/domain';

export interface DatedTask {
  readonly id: string;
  readonly title: string;
  readonly due_date: string | null;
  readonly project_id: string;
  readonly time_zone?: string | null;
  readonly is_all_day?: boolean;
}

export function monthCells(now: Date, weekStart: 'monday' | 'sunday'): Date[] {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const shift = (start.getDay() - (weekStart === 'monday' ? 1 : 0) + 7) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(index - shift + 1);
    return day;
  });
}

/** UTC slice used to match a cell with a stored due instant. Do not use this as a human date. */
export function cellKey(day: Date): string {
  return day.toISOString().slice(0, 10);
}

/** Local calendar date of the cell, from getFullYear/getMonth/getDate. */
export function localDateParam(day: Date): string {
  const month = String(day.getMonth() + 1).padStart(2, '0');
  const date = String(day.getDate()).padStart(2, '0');
  return `${String(day.getFullYear())}-${month}-${date}`;
}

export function dayFromParam(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const day = new Date(year, month - 1, date);
  if (day.getFullYear() !== year || day.getMonth() !== month - 1 || day.getDate() !== date) {
    return null;
  }
  return day;
}

export function localToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function tasksOnCell<T extends { due_date: string | null; time_zone?: string | null }>(
  tasks: readonly T[],
  day: Date,
  timeZone = 'Europe/Madrid',
): T[] {
  const key = localDateParam(day);
  return tasks.filter((task) => {
    if (task.due_date === null || task.due_date.length === 0) {
      return false;
    }
    return calendarDateKey(task.due_date, task.time_zone ?? timeZone) === key;
  });
}

/** A task is overdue only when its local day is before today. Today stays neutral. */
export function isCalendarOverdue(due: string | null, timeZone: string, now: Date): boolean {
  if (due === null || due.length === 0) {
    return false;
  }
  return calendarDateKey(due, timeZone) < localDateParam(now);
}

/** dueAfter is exclusive (gt) and dueBefore is exclusive (lt). Covers every cell, including padding. */
export function monthQueryRange(cells: readonly Date[]): {
  readonly dueAfter: string;
  readonly dueBefore: string;
} {
  const first = cells[0];
  const last = cells.at(-1);
  if (first === undefined || last === undefined) {
    const now = new Date().toISOString();
    return { dueAfter: now, dueBefore: now };
  }
  const before = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
  return {
    dueAfter: new Date(first.getTime() - 1).toISOString(),
    dueBefore: before.toISOString(),
  };
}

export function yearQueryRange(now: Date): {
  readonly dueAfter: string;
  readonly dueBefore: string;
} {
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  return {
    dueAfter: new Date(start.getTime() - 1).toISOString(),
    dueBefore: end.toISOString(),
  };
}

export function overflowHref(day: Date): string {
  return `/calendar/day?date=${localDateParam(day)}`;
}
