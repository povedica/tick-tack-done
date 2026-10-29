import { calendarDateKey } from '@reflexionia/domain';
import type { ExternalEventView } from '../calendar/ExternalEvent';
import { localDateParam } from './month';

let viewerZone: string | undefined;

function browserZone(): string {
  viewerZone ??= Intl.DateTimeFormat().resolvedOptions().timeZone;
  return viewerZone;
}

const rangeByEvent = new WeakMap<ExternalEventView, Map<string, { start: string; end: string }>>();

/** iCalendar's end is exclusive, including all-day and midnight-ending events. */
export function eventDayRange(
  event: ExternalEventView,
  timeZone = browserZone(),
): { start: string; end: string } {
  let byZone = rangeByEvent.get(event);
  const cached = byZone?.get(timeZone);
  if (cached !== undefined) {
    return cached;
  }
  const range = computeEventDayRange(event, timeZone);
  if (byZone === undefined) {
    byZone = new Map();
    rangeByEvent.set(event, byZone);
  }
  byZone.set(timeZone, range);
  return range;
}

function computeEventDayRange(
  event: ExternalEventView,
  timeZone: string,
): { start: string; end: string } {
  // All-day records keep their civil dates; timed records follow the viewer's zone.
  const zone = event.is_all_day ? (event.time_zone ?? 'Europe/Madrid') : timeZone;
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
  return event.is_all_day;
}
