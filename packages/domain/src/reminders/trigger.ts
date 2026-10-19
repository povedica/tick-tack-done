import { addCalendarDays, instantFromWall, wallClock } from '../dates/zoned';
import { isIanaTimeZone } from '../tasks/time-zone';

/** RF-808. The scheduler materializes at least this far ahead. */
export const REMINDER_HORIZON_MS = 48 * 60 * 60 * 1000;

/** Offsets a user can pick as the default reminder for dated tasks. */
export const ACCOUNT_REMINDER_TRIGGERS = [
  '-PT0M',
  '-PT5M',
  '-PT15M',
  '-PT30M',
  '-PT1H',
  '-P1D',
] as const;

export type AccountReminderTrigger = (typeof ACCOUNT_REMINDER_TRIGGERS)[number];

/** A list uses this value to stay quiet even when the account has a default. */
export const LIST_REMINDER_OFF = 'off';

export function isAccountReminderTrigger(value: string): value is AccountReminderTrigger {
  return (ACCOUNT_REMINDER_TRIGGERS as readonly string[]).includes(value);
}

/** List override wins. `off` means no reminder. Null on the list inherits the account. */
export function resolveDefaultReminder(account: string | null, list: string | null): string | null {
  if (list === LIST_REMINDER_OFF) {
    return null;
  }
  if (list !== null && isAccountReminderTrigger(list)) {
    return list;
  }
  if (account !== null && isAccountReminderTrigger(account)) {
    return account;
  }
  return null;
}

export type TriggerParse =
  | {
      readonly ok: true;
      readonly kind: 'relative';
      readonly related: 'due' | 'start';
      readonly offsetMs: number;
    }
  | { readonly ok: true; readonly kind: 'absolute'; readonly at: string }
  | { readonly ok: false; readonly reason: 'invalid_trigger' };

const DURATION =
  /^(?:TRIGGER(?:;([^:]*))?:)?(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/** RF-801. Relative offsets use a signed iCalendar duration. Absolute instants use VALUE=DATE-TIME. */
export function parseTrigger(trigger: string): TriggerParse {
  const text = trigger.trim().toUpperCase();
  const absolute = /^TRIGGER;VALUE=DATE-TIME:(\d{8}T\d{6}Z)$/.exec(text);
  if (absolute?.[1] !== undefined) {
    const stamp = absolute[1];
    const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}.000Z`;
    if (Number.isNaN(Date.parse(iso))) {
      return { ok: false, reason: 'invalid_trigger' };
    }
    return { ok: true, kind: 'absolute', at: iso };
  }
  const match = DURATION.exec(text);
  if (match === null) {
    return { ok: false, reason: 'invalid_trigger' };
  }
  const weeks = match[3];
  const days = match[4];
  const hours = match[5];
  const minutes = match[6];
  const seconds = match[7];
  if (
    weeks === undefined &&
    days === undefined &&
    hours === undefined &&
    minutes === undefined &&
    seconds === undefined
  ) {
    return { ok: false, reason: 'invalid_trigger' };
  }
  const totalSeconds =
    (Number(weeks ?? 0) * 7 + Number(days ?? 0)) * 86_400 +
    Number(hours ?? 0) * 3_600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0);
  const sign = match[2] === '-' ? -1 : 1;
  const related = (match[1] ?? '').includes('RELATED=START') ? 'start' : 'due';
  return { ok: true, kind: 'relative', related, offsetMs: sign * totalSeconds * 1000 };
}

export function reminderFireAt(input: {
  readonly trigger: string;
  readonly type: 'relative' | 'absolute' | 'location' | 'daily_digest';
  readonly dueDate: string | null;
  readonly startDate: string | null;
  readonly absoluteAt: string | null;
}):
  | { ok: true; fireAt: string | null }
  | { ok: false; reason: 'invalid_trigger' | 'missing_anchor' | 'invalid_date' } {
  if (input.type === 'location' || input.type === 'daily_digest') {
    return { ok: true, fireAt: null };
  }
  if (input.type === 'absolute') {
    const at = input.absoluteAt;
    if (at === null || Number.isNaN(Date.parse(at))) {
      return { ok: false, reason: 'invalid_date' };
    }
    return { ok: true, fireAt: new Date(at).toISOString() };
  }
  const parsed = parseTrigger(input.trigger);
  if (!parsed.ok) {
    return parsed;
  }
  if (parsed.kind === 'absolute') {
    return { ok: true, fireAt: parsed.at };
  }
  const anchor = parsed.related === 'start' ? input.startDate : input.dueDate;
  if (anchor === null || Number.isNaN(Date.parse(anchor))) {
    return { ok: false, reason: 'missing_anchor' };
  }
  return { ok: true, fireAt: new Date(Date.parse(anchor) + parsed.offsetMs).toISOString() };
}

export type ReminderSnoozePreset = '10m' | '1h' | 'tomorrow' | 'custom';

/** RF-804. Snooze moves the next fire time; it does not change the task due date. */
export function snoozeReminder(input: {
  readonly now: string;
  readonly timeZone: string;
  readonly preset: ReminderSnoozePreset;
  readonly until?: string | null;
}):
  | { ok: true; until: string }
  | { ok: false; reason: 'invalid_zone' | 'invalid_date' | 'date_required' } {
  if (!isIanaTimeZone(input.timeZone)) {
    return { ok: false, reason: 'invalid_zone' };
  }
  const now = new Date(input.now);
  if (Number.isNaN(now.getTime())) {
    return { ok: false, reason: 'invalid_date' };
  }
  if (input.preset === '10m') {
    return { ok: true, until: new Date(now.getTime() + 10 * 60_000).toISOString() };
  }
  if (input.preset === '1h') {
    return { ok: true, until: new Date(now.getTime() + 60 * 60_000).toISOString() };
  }
  if (input.preset === 'custom') {
    if (
      input.until === null ||
      input.until === undefined ||
      Number.isNaN(Date.parse(input.until))
    ) {
      return { ok: false, reason: 'date_required' };
    }
    return { ok: true, until: new Date(input.until).toISOString() };
  }
  const wall = wallClock(input.now, input.timeZone);
  if (wall === null) {
    return { ok: false, reason: 'invalid_date' };
  }
  const tomorrow = instantFromWall(addCalendarDays(wall, 1), input.timeZone);
  if (tomorrow === null) {
    return { ok: false, reason: 'invalid_date' };
  }
  return { ok: true, until: tomorrow };
}

/** RF-803. The next constant ping is one interval after the fire that just happened. */
export function nextConstantFire(firedAt: string, intervalMinutes: number): string | null {
  if (
    !Number.isInteger(intervalMinutes) ||
    intervalMinutes < 1 ||
    Number.isNaN(Date.parse(firedAt))
  ) {
    return null;
  }
  return new Date(Date.parse(firedAt) + intervalMinutes * 60_000).toISOString();
}

/** RF-805. Next local clock time strictly after `now`, or later today if it has not passed. */
export function nextDailyReminder(input: {
  readonly time: string;
  readonly timeZone: string;
  readonly now: string;
}):
  | { ok: true; fireAt: string }
  | { ok: false; reason: 'invalid_time' | 'invalid_zone' | 'invalid_date' } {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(input.time);
  if (match?.[1] === undefined || match[2] === undefined) {
    return { ok: false, reason: 'invalid_time' };
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) {
    return { ok: false, reason: 'invalid_time' };
  }
  if (!isIanaTimeZone(input.timeZone)) {
    return { ok: false, reason: 'invalid_zone' };
  }
  const nowWall = wallClock(input.now, input.timeZone);
  if (nowWall === null) {
    return { ok: false, reason: 'invalid_date' };
  }
  const today = instantFromWall({ ...nowWall, hour, minute, second }, input.timeZone);
  if (today !== null && Date.parse(today) > Date.parse(input.now)) {
    return { ok: true, fireAt: today };
  }
  const tomorrow = instantFromWall(
    { ...addCalendarDays(nowWall, 1), hour, minute, second },
    input.timeZone,
  );
  if (tomorrow === null) {
    return { ok: false, reason: 'invalid_date' };
  }
  return { ok: true, fireAt: tomorrow };
}

export function reminderDisposition(
  fireAt: string,
  now: string,
  catchUp: boolean,
): 'scheduled' | 'fire' | 'late' | 'beyond_horizon' {
  const at = Date.parse(fireAt);
  const current = Date.parse(now);
  if (Number.isNaN(at) || Number.isNaN(current)) {
    return 'beyond_horizon';
  }
  if (at > current + REMINDER_HORIZON_MS) {
    return 'beyond_horizon';
  }
  if (at > current) {
    return 'scheduled';
  }
  return catchUp ? 'late' : 'fire';
}
