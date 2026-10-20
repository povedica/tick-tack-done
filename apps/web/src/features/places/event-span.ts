import { calendarDateKey } from '@reflexionia/domain';
import type { ExternalEventView } from '../calendar/ExternalEvent';
import { localDateParam } from './month';

/** iCalendar's end is exclusive, including all-day and midnight-ending events. */
export function eventDayRange(event: ExternalEventView): { start: string; end: string } {
  const zone = event.time_zone ?? 'Europe/Madrid';
  const end =
    event.ends_at !== null && Date.parse(event.ends_at) > Date.parse(event.starts_at)
      ? new Date(Date.parse(event.ends_at) - 1).toISOString()
      : event.starts_at;
  return { start: calendarDateKey(event.starts_at, zone), end: calendarDateKey(end, zone) };
}

export function eventSpan(
  event: ExternalEventView,
  days: readonly Date[],
): { column: number; span: number } | null {
  const { start, end } = eventDayRange(event);
  const visible = days.flatMap((day, index) => {
    const key = localDateParam(day);
    return key >= start && key <= end ? [index] : [];
  });
  const first = visible[0];
  return first === undefined ? null : { column: first + 2, span: visible.length };
}

export function isSpanningEvent(event: ExternalEventView): boolean {
  const range = eventDayRange(event);
  return event.is_all_day || range.start !== range.end;
}
