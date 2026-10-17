import { fromZonedTime, toZonedTime } from 'date-fns-tz';
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

/** Interpret wall-clock fields as local time in `timeZone` and return UTC ISO. */
export function instantFromWall(wall: WallClock, timeZone: string): string | null {
  if (!isIanaTimeZone(timeZone)) {
    return null;
  }
  const local = new Date(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  if (
    local.getFullYear() !== wall.year ||
    local.getMonth() !== wall.month - 1 ||
    local.getDate() !== wall.day
  ) {
    return null;
  }
  const instant = fromZonedTime(local, timeZone);
  if (Number.isNaN(instant.getTime())) {
    return null;
  }
  return instant.toISOString();
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
