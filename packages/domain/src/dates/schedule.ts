import { isIanaTimeZone } from '../tasks/time-zone';
import { addCalendarDays, instantFromWall, wallClock, type WallClock } from './zoned';

export type DateSnoozePreset = 'tomorrow' | 'next_week' | 'date';

export type ScheduleFailure = 'invalid_zone' | 'invalid_date' | 'date_required';

export interface SnoozedDates {
  readonly dueDate: string;
  readonly startDate: string | null;
}

/** RF-603. An all-day task is overdue only once its local date has passed. */
export function isOverdue(input: {
  readonly status: 'active' | 'completed' | 'archived' | 'cancelled';
  readonly dueDate: string | null;
  readonly isAllDay: boolean;
  readonly timeZone: string;
  readonly now: string;
}): boolean {
  if (input.status !== 'active' || input.dueDate === null) {
    return false;
  }
  if (!isIanaTimeZone(input.timeZone)) {
    return false;
  }
  const due = new Date(input.dueDate);
  const now = new Date(input.now);
  if (Number.isNaN(due.getTime()) || Number.isNaN(now.getTime())) {
    return false;
  }
  if (!input.isAllDay) {
    return due.getTime() < now.getTime();
  }
  const dueWall = wallClock(input.dueDate, input.timeZone);
  const nowWall = wallClock(input.now, input.timeZone);
  if (dueWall === null || nowWall === null) {
    return false;
  }
  return localDayNumber(dueWall) < localDayNumber(nowWall);
}

/**
 * RF-605. Snooze moves the due date; it does not touch reminders.
 * Tomorrow and next week are counted from `now` in the capture zone, keeping the due clock time.
 */
export function snoozeDue(input: {
  readonly dueDate: string | null;
  readonly startDate: string | null;
  readonly isAllDay: boolean;
  readonly timeZone: string;
  readonly now: string;
  readonly preset: DateSnoozePreset;
  readonly date?: string | null;
}): { ok: true; dates: SnoozedDates } | { ok: false; reason: ScheduleFailure } {
  if (!isIanaTimeZone(input.timeZone)) {
    return { ok: false, reason: 'invalid_zone' };
  }
  const nowWall = wallClock(input.now, input.timeZone);
  if (nowWall === null) {
    return { ok: false, reason: 'invalid_date' };
  }
  const clock = input.dueDate === null ? nowWall : wallClock(input.dueDate, input.timeZone);
  if (clock === null) {
    return { ok: false, reason: 'invalid_date' };
  }

  let target: WallClock;
  if (input.preset === 'date') {
    if (input.date === null || input.date === undefined) {
      return { ok: false, reason: 'date_required' };
    }
    const requested = wallClock(input.date, input.timeZone);
    if (requested === null) {
      return { ok: false, reason: 'invalid_date' };
    }
    target = input.isAllDay ? atMidnight(requested) : requested;
  } else {
    const days = input.preset === 'tomorrow' ? 1 : 7;
    const shifted = addCalendarDays(nowWall, days);
    target = input.isAllDay
      ? atMidnight(shifted)
      : { ...shifted, hour: clock.hour, minute: clock.minute, second: clock.second };
  }

  const dueDate = instantFromWall(target, input.timeZone);
  if (dueDate === null) {
    return { ok: false, reason: 'invalid_date' };
  }
  return {
    ok: true,
    dates: { dueDate, startDate: shiftStart(input.startDate, input.dueDate, dueDate) },
  };
}

function shiftStart(
  start: string | null,
  previousDue: string | null,
  nextDue: string,
): string | null {
  if (start === null || previousDue === null) {
    return start;
  }
  const delta = Date.parse(nextDue) - Date.parse(previousDue);
  if (Number.isNaN(delta) || Number.isNaN(Date.parse(start))) {
    return null;
  }
  return new Date(Date.parse(start) + delta).toISOString();
}

function atMidnight(wall: WallClock): WallClock {
  return { ...wall, hour: 0, minute: 0, second: 0 };
}

function localDayNumber(wall: WallClock): number {
  return Math.floor(Date.UTC(wall.year, wall.month - 1, wall.day) / 86_400_000);
}
