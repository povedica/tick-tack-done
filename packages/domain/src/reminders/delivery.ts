import { addCalendarDays, instantFromWall, wallClock } from '../dates/zoned';

/** How long after the due instant an overdue notice may still be created. */
export const OVERDUE_GRACE_MS = 3 * 60 * 1000;

const DUE_SOON_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = [60_000, 5 * 60_000, 15 * 60_000] as const;
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** A reminder whose fire time is already past must not be enqueued on a normal tick. */
export function skipPastEnqueue(fireAt: string, now: string): boolean {
  const at = Date.parse(fireAt);
  const current = Date.parse(now);
  return !Number.isNaN(at) && !Number.isNaN(current) && at <= current;
}

/**
 * Clock-time tasks get one due notice and, if the tick just crossed the due
 * instant, one overdue notice. All-day tasks and the old backlog stay quiet.
 */
export function dueSignal(input: {
  readonly due: string;
  readonly now: string;
  readonly isAllDay: boolean;
}): 'due_soon' | 'overdue' | 'skip' {
  if (input.isAllDay) {
    return 'skip';
  }
  const due = Date.parse(input.due);
  const now = Date.parse(input.now);
  if (Number.isNaN(due) || Number.isNaN(now)) {
    return 'skip';
  }
  if (due > now && due - now <= DUE_SOON_MS) {
    return 'due_soon';
  }
  if (due <= now && now - due <= OVERDUE_GRACE_MS) {
    return 'overdue';
  }
  return 'skip';
}

/** True when a relative trigger means "at the due instant", so due_soon would duplicate it. */
export function isAtDueTrigger(trigger: string): boolean {
  return trigger === '-PT0M' || trigger === 'TRIGGER:-PT0M';
}

/** Delay before the next Telegram attempt. Null after the third failure. */
export function retryDelayMs(attemptsAfterFailure: number): number | null {
  return RETRY_MS[attemptsAfterFailure - 1] ?? null;
}

/**
 * When `now` falls inside quiet hours, returns the local instant when delivery
 * may resume. Overnight ranges (22:00–07:00) end the next morning.
 */
export function quietUntil(
  nowIso: string,
  timeZone: string,
  start: string | null,
  end: string | null,
): string | null {
  if (start === null || end === null || start === end) {
    return null;
  }
  if (!CLOCK.test(start) || !CLOCK.test(end)) {
    return null;
  }
  const now = wallClock(nowIso, timeZone);
  if (now === null) {
    return null;
  }
  const minutes = now.hour * 60 + now.minute;
  const startMin = clockMinutes(start);
  const endMin = clockMinutes(end);
  const overnight = startMin > endMin;
  const inside = overnight
    ? minutes >= startMin || minutes < endMin
    : minutes >= startMin && minutes < endMin;
  if (!inside) {
    return null;
  }
  const day = overnight && minutes >= startMin ? addCalendarDays(now, 1) : now;
  const [hour, minute] = end.split(':').map(Number);
  return instantFromWall(
    { ...day, hour: hour ?? 0, minute: minute ?? 0, second: 0 },
    timeZone,
  );
}

/** An all-day task stores midnight in its zone. Any other clock time is a timed task. */
export function allDayClockConflict(
  dueIso: string | null,
  isAllDay: boolean,
  timeZone: string,
): boolean {
  if (!isAllDay || dueIso === null) {
    return false;
  }
  const wall = wallClock(dueIso, timeZone);
  if (wall === null) {
    return false;
  }
  return wall.hour !== 0 || wall.minute !== 0 || wall.second !== 0;
}

function clockMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}
