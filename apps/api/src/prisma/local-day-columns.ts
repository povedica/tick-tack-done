import { entryLocalDays } from '@reflexionia/domain';

export interface TaskLocalDayColumns {
  readonly localStartDay: Date | null;
  readonly localEndDay: Date | null;
}

export interface EventLocalDayColumns {
  readonly localStartDay: Date;
  readonly localEndDay: Date;
}

/** One capture-zone mark. A missing date clears both columns. */
export function taskLocalDayColumns(input: {
  readonly start: Date | null;
  readonly due: Date | null;
  readonly timeZone: string;
}): TaskLocalDayColumns {
  const span = entryLocalDays(
    {
      kind: 'task',
      start: input.start?.toISOString() ?? null,
      due: input.due?.toISOString() ?? null,
      timeZone: input.timeZone,
      allDay: false,
    },
    { profileTimeZone: input.timeZone },
  );
  if (span === null) {
    return { localStartDay: null, localEndDay: null };
  }
  return { localStartDay: utcDate(span.start), localEndDay: utcDate(span.end) };
}

/** All-day events use their own zone. Timed events use the profile zone (E-perfil). */
export function eventLocalDayColumns(input: {
  readonly start: Date;
  readonly end: Date | null;
  readonly timeZone: string;
  readonly allDay: boolean;
  readonly profileTimeZone: string;
}): EventLocalDayColumns {
  const span = entryLocalDays(
    {
      kind: 'event',
      start: input.start.toISOString(),
      end: input.end?.toISOString() ?? null,
      timeZone: input.timeZone,
      allDay: input.allDay,
    },
    { profileTimeZone: input.profileTimeZone },
  );
  const start = span?.start ?? input.start.toISOString().slice(0, 10);
  const end = span?.end ?? start;
  return { localStartDay: utcDate(start), localEndDay: utcDate(end) };
}

function utcDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

export function stampTaskRow<T>(data: T): T {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return data;
  }
  const row = data as Record<string, unknown>;
  if (!('startDate' in row) || !('dueDate' in row) || !('timeZone' in row)) {
    return data;
  }
  const start = row.startDate;
  const due = row.dueDate;
  const timeZone = row.timeZone;
  if (typeof timeZone !== 'string' || !isDateOrNull(start) || !isDateOrNull(due)) {
    return data;
  }
  return { ...row, ...taskLocalDayColumns({ start, due, timeZone }) } as T;
}

function isDateOrNull(value: unknown): value is Date | null {
  return value === null || value instanceof Date;
}
