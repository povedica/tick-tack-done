import { calendarDateKey, shiftLocalDays } from '../filters/clause';

/** Inclusive civil-day span. `end` is the last day that still belongs to the entry. */
export interface EntryLocalDays {
  readonly start: string;
  readonly end: string;
  readonly days: readonly string[];
}

export interface TaskLocalInput {
  readonly kind: 'task';
  readonly start: string | null;
  readonly due: string | null;
  /** Capture zone (RF-604). A profile or browser zone does not move the task. */
  readonly timeZone: string;
  readonly allDay: boolean;
}

export interface EventLocalInput {
  readonly kind: 'event';
  readonly start: string;
  readonly end: string | null;
  /** Zone of an all-day event. Timed events ignore it and use the profile zone. */
  readonly timeZone: string;
  readonly allDay: boolean;
}

export interface LocalDayContext {
  /**
   * E-perfil: timed events take their civil days from this zone.
   * Tasks and all-day events ignore it.
   */
  readonly profileTimeZone: string;
}

const MAX_SPAN_DAYS = 3660;

/**
 * Civil days an entry occupies.
 * A task is one mark: the capture-zone day of `start ?? due`.
 * An all-day event is each civil day of `[start, end)` in the event zone.
 * A timed event is each civil day of `[start, end)` in the profile zone.
 * An end at local midnight does not include the next day.
 */
export function entryLocalDays(
  entry: TaskLocalInput | EventLocalInput,
  context: LocalDayContext,
): EntryLocalDays | null {
  if (entry.kind === 'task') {
    const effective = entry.start ?? entry.due;
    if (effective === null || effective.length === 0) {
      return null;
    }
    const day = calendarDateKey(effective, entry.timeZone);
    return { start: day, end: day, days: [day] };
  }
  const zone = entry.allDay ? entry.timeZone : context.profileTimeZone;
  const startDay = calendarDateKey(entry.start, zone);
  const endDay = calendarDateKey(inclusiveEnd(entry.start, entry.end), zone);
  const days = inclusiveDays(entry.start, startDay, endDay, zone);
  const first = days[0] ?? startDay;
  const last = days[days.length - 1] ?? first;
  return { start: first, end: last, days };
}

/** iCalendar end is exclusive, including an end that lands on local midnight. */
function inclusiveEnd(start: string, end: string | null): string {
  if (end === null || end.length === 0) {
    return start;
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return start;
  }
  return new Date(endMs - 1).toISOString();
}

function inclusiveDays(
  startIso: string,
  startDay: string,
  endDay: string,
  zone: string,
): readonly string[] {
  if (endDay <= startDay) {
    return [startDay];
  }
  const days = [startDay];
  let cursor = startIso;
  let previous = startDay;
  for (let guard = 0; guard < MAX_SPAN_DAYS; guard += 1) {
    const next = shiftLocalDays(cursor, zone, 1);
    if (next === null) {
      break;
    }
    cursor = next;
    const key = calendarDateKey(cursor, zone);
    if (key <= previous) {
      break;
    }
    days.push(key);
    previous = key;
    if (key >= endDay) {
      break;
    }
  }
  return days;
}
