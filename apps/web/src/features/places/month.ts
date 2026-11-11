import { calendarDateKey, plannedForLater } from '@reflexionia/domain';
import { displayTitle } from '../tasks/displayTitle';

export interface DatedTask {
  readonly id: string;
  readonly title: string;
  readonly due_date: string | null;
  readonly project_id: string;
  readonly time_zone?: string | null;
  readonly is_all_day?: boolean;
}

/** First month of the calendar quarter that contains `day` (Jan, Apr, Jul or Oct). */
export function quarterStart(day: Date): Date {
  const month = Math.floor(day.getMonth() / 3) * 3;
  return new Date(day.getFullYear(), month, 1);
}

export function quarterMonths(day: Date): Date[] {
  const start = quarterStart(day);
  return [0, 1, 2].map((offset) => new Date(start.getFullYear(), start.getMonth() + offset, 1));
}

export function startOfWeek(day: Date, weekStart: 'monday' | 'sunday'): Date {
  const shift = (day.getDay() - (weekStart === 'monday' ? 1 : 0) + 7) % 7;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - shift);
}

export function spanDays(start: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, index) => {
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
  });
}

export function viewDays(view: string, cursor: Date, weekStart: 'monday' | 'sunday'): Date[] {
  const day = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
  if (view === 'day') {
    return [day];
  }
  if (view === 'agenda') {
    return spanDays(day, 60);
  }
  if (view === 'week') {
    return spanDays(startOfWeek(day, weekStart), 7);
  }
  if (view === 'multi-day') {
    return spanDays(day, 3);
  }
  if (view === 'two-weeks') {
    return spanDays(startOfWeek(day, weekStart), 14);
  }
  if (view === 'quarter') {
    return quarterMonths(day).flatMap((month) => monthCells(month, weekStart));
  }
  return monthCells(new Date(day.getFullYear(), day.getMonth(), 1), weekStart);
}

export function shiftView(
  cursor: Date,
  view: string,
  delta: number,
  weekStart: 'monday' | 'sunday',
): Date {
  if (view === 'year') {
    return new Date(cursor.getFullYear() + delta, cursor.getMonth(), 1);
  }
  if (view === 'quarter') {
    const start = quarterStart(cursor);
    return new Date(start.getFullYear(), start.getMonth() + delta * 3, 1);
  }
  if (view === 'month') {
    return new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
  }
  const step =
    view === 'agenda'
      ? 30
      : view === 'week'
        ? 7
        : view === 'two-weeks'
          ? 14
          : view === 'multi-day'
            ? 3
            : 1;
  const origin = view === 'week' || view === 'two-weeks' ? startOfWeek(cursor, weekStart) : cursor;
  return new Date(origin.getFullYear(), origin.getMonth(), origin.getDate() + delta * step);
}

/** ISO-8601: week one contains January 4, regardless of the user's grid week start. */
export function isoWeek(day: Date): number {
  const date = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const year = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - year.getTime()) / 86_400_000 + 1) / 7);
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

export function tasksOnCell<
  T extends { due_date: string | null; start_date?: string | null; time_zone?: string | null },
>(tasks: readonly T[], day: Date, timeZone = 'Europe/Madrid'): T[] {
  const key = localDateParam(day);
  return tasks.filter((task) => {
    const effective = task.start_date ?? task.due_date;
    if (effective === null || effective.length === 0) {
      return false;
    }
    return calendarDateKey(effective, task.time_zone ?? timeZone) === key;
  });
}

/** A task is overdue only when its local day is before today and it is not planned later. */
export function isCalendarOverdue(
  due: string | null,
  timeZone: string,
  now: Date,
  start?: string | null,
): boolean {
  if (plannedForLater({ startDate: start, timeZone }, now)) {
    return false;
  }
  if (due === null || due.length === 0) {
    return false;
  }
  return calendarDateKey(due, timeZone) < localDateParam(now);
}

/** dueAfter is exclusive (gt) and dueBefore is exclusive (lt). Covers every cell, including padding. */
export function monthQueryRange(cells: readonly Date[]): {
  readonly from: string;
  readonly to: string;
  readonly dueAfter: string;
  readonly dueBefore: string;
} {
  const first = cells[0];
  const last = cells.at(-1);
  if (first === undefined || last === undefined) {
    const now = new Date().toISOString();
    const day = localDateParam(new Date());
    return { from: day, to: day, dueAfter: now, dueBefore: now };
  }
  const before = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
  return {
    from: localDateParam(first),
    to: localDateParam(before),
    dueAfter: new Date(first.getTime() - 1).toISOString(),
    dueBefore: before.toISOString(),
  };
}

export function yearQueryRange(now: Date): {
  readonly from: string;
  readonly to: string;
  readonly dueAfter: string;
  readonly dueBefore: string;
} {
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  return {
    from: localDateParam(start),
    to: localDateParam(end),
    dueAfter: new Date(start.getTime() - 1).toISOString(),
    dueBefore: end.toISOString(),
  };
}

export function overflowHref(day: Date): string {
  return `/calendar/day?date=${localDateParam(day)}`;
}

const LEADING_DATE =
  /^(\d{1,2})[/.\\-](\d{1,2})(?:[/.\\-](\d{2,4}))?(?:[.,])?(?:\s*[-–—:]\s*|\s+|$)/u;

/** Drops a leading day/month that repeats the due date. The calendar cell already shows that day. */
export function calendarTaskLabel(
  title: string,
  dueDate: string | null,
  timeZone: string | null | undefined,
  untitled: string,
): string {
  const stripped = stripLeadingDueDate(displayTitle(title), dueDate, timeZone);
  return stripped.length === 0 ? untitled : stripped;
}

function stripLeadingDueDate(
  title: string,
  dueDate: string | null,
  timeZone: string | null | undefined,
): string {
  if (dueDate === null || dueDate.length === 0) {
    return title;
  }
  const zone =
    timeZone !== undefined && timeZone !== null && timeZone.length > 0 ? timeZone : 'UTC';
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(calendarDateKey(dueDate, zone));
  if (parts === null) {
    return title;
  }
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const match = LEADING_DATE.exec(title);
  if (match === null || Number(match[1]) !== day || Number(match[2]) !== month) {
    return title;
  }
  const leadYear = match[3];
  if (leadYear !== undefined) {
    const full = leadYear.length === 2 ? 2000 + Number(leadYear) : Number(leadYear);
    if (full !== year) {
      return title;
    }
  }
  return title.slice(match[0].length).trim();
}
