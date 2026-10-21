import { calendarDay, zonedWallTime } from '../today/groups';
import { HOUR_PX, minutesInZone } from '../places/hour';

export interface ViewSlot {
  readonly start: string;
  readonly end: string | null;
  readonly allDay: boolean;
}
export interface CalendarSlot extends ViewSlot {
  readonly timeZone: string;
}
export interface SlotAnchor {
  readonly x: number;
  readonly y: number;
  readonly element: HTMLElement;
}

export function snapToSlot(minutes: number, step = 30): number {
  return Math.max(0, Math.min(1440 - step, Math.floor(minutes / step) * step));
}

/** A repeated DST wall time chooses the later occurrence; a missing time advances. */
function wallInstant(day: string, minutes: number, timeZone: string): string {
  for (let value = minutes; value <= 1440; value += 30) {
    const instant = zonedWallTime(day, Math.floor(value / 60), value % 60, timeZone);
    if (
      instant !== null &&
      (value === 1440 ||
        (calendarDay(instant, timeZone) === day && minutesInZone(instant, timeZone) === value))
    )
      return instant;
  }
  throw new RangeError('Invalid calendar slot');
}

export function slotFromPoint(input: {
  readonly day: string;
  readonly clientY: number;
  readonly top: number;
  readonly timeZone: string;
  readonly endY?: number;
}): CalendarSlot {
  const at = (y: number) => snapToSlot(((y - input.top) / HOUR_PX) * 60);
  const first = at(input.clientY);
  const last =
    input.endY === undefined
      ? first
      : Math.max(0, Math.min(1440, Math.floor(((input.endY - input.top) / HOUR_PX) * 2) * 30));
  const start = wallInstant(input.day, Math.min(first, last), input.timeZone);
  // A click is 30 elapsed minutes; a drag ends at the selected half-hour boundary.
  const end =
    input.endY === undefined
      ? new Date(Date.parse(start) + 30 * 60_000).toISOString()
      : wallInstant(
          input.day,
          Math.min(1440, Math.max(Math.min(first, last) + 30, Math.max(first, last))),
          input.timeZone,
        );
  return { start, end, allDay: false, timeZone: input.timeZone };
}

export function allDaySlot(day: string, timeZone: string): CalendarSlot {
  return { start: wallInstant(day, 0, timeZone), end: null, allDay: true, timeZone };
}

export function slotToTaskBody(slot: ViewSlot, timeZone: string) {
  if (slot.allDay) return { due_date: slot.start, is_all_day: true, time_zone: timeZone };
  const end = slot.end ?? new Date(Date.parse(slot.start) + 30 * 60_000).toISOString();
  const duration = (Date.parse(end) - Date.parse(slot.start)) / 60_000;
  if (!Number.isFinite(duration) || duration <= 0)
    throw new RangeError('Invalid calendar duration');
  return {
    start_date: slot.start,
    due_date: end,
    duration_minutes: duration,
    is_all_day: false,
    time_zone: timeZone,
  };
}
