import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { isIanaTimeZone } from '../tasks/time-zone';

/** Wall-clock fields in a capture time zone. Month is 1–12. */
export interface WallClock {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

export function wallClock(iso: string, timeZone: string): WallClock | null {
  if (!isIanaTimeZone(timeZone)) {
    return null;
  }
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    return null;
  }
  const zoned = toZonedTime(instant, timeZone);
  return {
    year: zoned.getFullYear(),
    month: zoned.getMonth() + 1,
    day: zoned.getDate(),
    hour: zoned.getHours(),
    minute: zoned.getMinutes(),
    second: zoned.getSeconds(),
  };
}

/** UTC instant of local midnight for the calendar day of `iso` in `timeZone`. */
export function startOfZonedDay(iso: string, timeZone: string): string | null {
  const wall = wallClock(iso, timeZone);
  if (wall === null) {
    return null;
  }
  return instantFromWall({ ...wall, hour: 0, minute: 0, second: 0 }, timeZone);
}

/** Interpret wall-clock fields as local time in `timeZone` and return UTC ISO. */
export function instantFromWall(wall: WallClock, timeZone: string): string | null {
  if (!isIanaTimeZone(timeZone) || !calendarDayExists(wall)) {
    return null;
  }
  if (
    wall.hour < 0 ||
    wall.hour > 23 ||
    wall.minute < 0 ||
    wall.minute > 59 ||
    wall.second < 0 ||
    wall.second > 59
  ) {
    return null;
  }
  const stamp = `${pad(wall.year, 4)}-${pad(wall.month, 2)}-${pad(wall.day, 2)} ${pad(wall.hour, 2)}:${pad(wall.minute, 2)}:${pad(wall.second, 2)}`;
  let instant: Date;
  try {
    instant = fromZonedTime(stamp, timeZone);
  } catch {
    return null;
  }
  if (Number.isNaN(instant.getTime())) {
    return null;
  }
  const back = formatInTimeZone(instant, timeZone, 'yyyy-MM-dd HH:mm:ss');
  if (back === stamp) {
    const earlier = new Date(instant.getTime() - 3_600_000);
    if (formatInTimeZone(earlier, timeZone, 'yyyy-MM-dd HH:mm:ss') === stamp) {
      return earlier.toISOString();
    }
    return instant.toISOString();
  }
  const shifted = shiftedGap(instant, stamp, back);
  return shifted;
}

function calendarDayExists(wall: WallClock): boolean {
  const probe = new Date(Date.UTC(wall.year, wall.month - 1, wall.day));
  return (
    probe.getUTCFullYear() === wall.year &&
    probe.getUTCMonth() === wall.month - 1 &&
    probe.getUTCDate() === wall.day
  );
}

function shiftedGap(instant: Date, wanted: string, actual: string): string | null {
  const left = stampParts(wanted);
  const right = stampParts(actual);
  if (left === null || right === null) {
    return null;
  }
  if (left.day !== right.day || left.seconds === right.seconds) {
    return null;
  }
  return new Date(instant.getTime() + (left.seconds - right.seconds) * 1000).toISOString();
}

function stampParts(stamp: string): { day: string; seconds: number } | null {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(stamp);
  if (
    match?.[1] === undefined ||
    match[2] === undefined ||
    match[3] === undefined ||
    match[4] === undefined
  ) {
    return null;
  }
  return {
    day: match[1],
    seconds: Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4]),
  };
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function addCalendarDays(wall: WallClock, days: number): WallClock {
  const shifted = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: wall.hour,
    minute: wall.minute,
    second: wall.second,
  };
}

export function addCalendarMonths(
  year: number,
  month: number,
  delta: number,
): {
  year: number;
  month: number;
} {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function basicUtc(iso: string): string | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    return null;
  }
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${String(instant.getUTCFullYear())}${pad(instant.getUTCMonth() + 1)}${pad(instant.getUTCDate())}` +
    `T${pad(instant.getUTCHours())}${pad(instant.getUTCMinutes())}${pad(instant.getUTCSeconds())}Z`
  );
}

export function basicLocal(wall: WallClock): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${String(wall.year)}${pad(wall.month)}${pad(wall.day)}` +
    `T${pad(wall.hour)}${pad(wall.minute)}${pad(wall.second)}`
  );
}
