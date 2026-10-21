import { addCalendarDays, instantFromWall, wallClock } from '../dates/zoned';

export const DRAG_SNAP_MINUTES = 15;
export interface CalendarDragTask {
  readonly start_date: string | null;
  readonly due_date: string | null;
  readonly duration_minutes: number | null;
  readonly is_all_day: boolean;
}
export interface CalendarDragTarget {
  readonly day: string;
  readonly minute?: number;
  readonly allDay?: boolean;
  readonly preserveClock?: boolean;
  readonly duration?: number;
  readonly laterOccurrence?: boolean;
}
export function calendarDragPatch(
  task: CalendarDragTask,
  target: CalendarDragTarget,
  zone: string,
) {
  const [year = 0, month = 0, day = 0] = target.day.split('-').map(Number);
  const old = wallClock(task.start_date ?? task.due_date ?? '', zone);
  const minute = target.preserveClock && old ? old.hour * 60 + old.minute : (target.minute ?? 0);
  const allDay = target.preserveClock ? task.is_all_day : !!target.allDay;
  const wall = {
    year,
    month,
    day,
    hour: allDay ? 0 : Math.floor(minute / 60),
    minute: allDay ? 0 : minute % 60,
    second: 0,
  };
  let start = instantFromWall(wall, zone);
  if (start !== null && target.laterOccurrence && !allDay) {
    const later = new Date(Date.parse(start) + 3600000).toISOString();
    const back = wallClock(later, zone);
    if (
      back?.year === wall.year &&
      back.month === wall.month &&
      back.day === wall.day &&
      back.hour === wall.hour &&
      back.minute === wall.minute
    )
      start = later;
  }
  if (start === null) throw new RangeError('Invalid calendar destination');
  if (allDay)
    return {
      start_date: null,
      due_date: start,
      duration_minutes: null,
      is_all_day: true,
      time_zone: zone,
    };
  let duration = target.duration ?? (task.is_all_day ? 60 : (task.duration_minutes ?? 30));
  if (target.duration !== undefined) {
    const midnight = instantFromWall(addCalendarDays({ ...wall, hour: 0, minute: 0 }, 1), zone);
    if (midnight === null) throw new RangeError('Invalid calendar end');
    duration = Math.min(Math.max(15, duration), (Date.parse(midnight) - Date.parse(start)) / 60000);
  }
  if (!Number.isFinite(duration) || duration <= 0)
    throw new RangeError('Invalid calendar duration');
  return {
    start_date: start,
    due_date: new Date(Date.parse(start) + duration * 60000).toISOString(),
    duration_minutes: duration,
    is_all_day: false,
    time_zone: zone,
  };
}

/** Repeated hour of a fall-back day, or null for a regular/spring day. */
export function calendarRepeatedHour(dayKey: string, zone: string): number | null {
  const [year = 0, month = 0, day = 0] = dayKey.split('-').map(Number);
  const wall = { year, month, day, hour: 0, minute: 0, second: 0 };
  const first = instantFromWall(wall, zone);
  const next = instantFromWall(addCalendarDays(wall, 1), zone);
  if (!first || !next || Date.parse(next) - Date.parse(first) <= 86400000) return null;
  const seen = new Set<number>();
  for (let at = Date.parse(first); at < Date.parse(next); at += 3600000) {
    const hour = wallClock(new Date(at).toISOString(), zone)?.hour;
    if (hour === undefined) continue;
    if (seen.has(hour)) return hour;
    seen.add(hour);
  }
  return null;
}
export function calendarAxisMinute(iso: string, zone: string, repeated: number | null): number {
  const wall = wallClock(iso, zone);
  if (!wall) return 0;
  const minute = wall.hour * 60 + wall.minute;
  if (repeated === null) return minute;
  if (wall.hour > repeated) return minute + 60;
  if (wall.hour === repeated) {
    const first = instantFromWall(wall, zone);
    if (first && Date.parse(iso) > Date.parse(first)) return minute + 60;
  }
  return minute;
}
export function calendarAxisTarget(
  day: string,
  axis: number,
  repeated: number | null,
  zone: string,
): CalendarDragTarget {
  if (repeated === null) return { day, minute: axis };
  const boundary = (repeated + 1) * 60;
  return {
    day,
    minute: axis >= boundary ? axis - 60 : axis,
    laterOccurrence:
      axis >= boundary && axis < boundary + 60 && calendarRepeatedHour(day, zone) === repeated,
  };
}
