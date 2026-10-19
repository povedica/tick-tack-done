import { addCalendarDays, instantFromWall, type WallClock } from '../dates/zoned';

/** Subset of a Google Calendar API v3 event used by RF-2515. */
export interface GoogleEventSource {
  readonly id?: unknown;
  readonly summary?: unknown;
  readonly status?: unknown;
  readonly start?: GoogleEventWhen;
  readonly end?: GoogleEventWhen;
}

export interface GoogleEventWhen {
  readonly dateTime?: unknown;
  readonly date?: unknown;
  readonly timeZone?: unknown;
}

export type GoogleEventStatus = 'confirmed' | 'tentative' | 'cancelled';

export interface MappedGoogleEvent {
  readonly uid: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly isAllDay: boolean;
  readonly timeZone: string;
  readonly status: GoogleEventStatus;
}

const UNTITLED = '(sin título)';
const HOUR_MS = 60 * 60 * 1000;

/**
 * RF-2515. Maps one Google event into the external-event shape.
 * All-day dates stay civil in the user zone: `end.date` is exclusive.
 * Returns null when the event has no id or no parseable start (`skipped`).
 * A timed event without `end` ends one hour after it starts.
 */
export function mapGoogleEvent(
  event: GoogleEventSource,
  userTimeZone: string,
): MappedGoogleEvent | null {
  if (typeof event.id !== 'string' || event.id.length === 0) {
    return null;
  }
  const zone = userTimeZone.length > 0 ? userTimeZone : 'Europe/Madrid';
  if (event.status === 'cancelled') {
    const timed = timedInstant(event.start?.dateTime, zoneOf(event.start?.timeZone, zone));
    return {
      uid: event.id,
      title: titleOf(event.summary),
      startsAt: timed ?? new Date(0).toISOString(),
      endsAt: timed ?? new Date(0).toISOString(),
      isAllDay: false,
      timeZone: zoneOf(event.start?.timeZone, zone),
      status: 'cancelled',
    };
  }
  const allDay = typeof event.start?.date === 'string';
  if (allDay) {
    const start = civilStart(event.start.date, zone);
    if (start === null) {
      return null;
    }
    const end = allDayEnd(event.end?.date, event.start.date, zone);
    if (end === null) {
      return null;
    }
    return {
      uid: event.id,
      title: titleOf(event.summary),
      startsAt: start,
      endsAt: end,
      isAllDay: true,
      timeZone: zone,
      status: statusOf(event.status),
    };
  }
  const startZone = zoneOf(event.start?.timeZone, zone);
  const start = timedInstant(event.start?.dateTime, startZone);
  if (start === null) {
    return null;
  }
  const endZone = zoneOf(event.end?.timeZone, startZone);
  const endTimed = timedInstant(event.end?.dateTime, endZone);
  const endsAt = endTimed ?? new Date(new Date(start).getTime() + HOUR_MS).toISOString();
  return {
    uid: event.id,
    title: titleOf(event.summary),
    startsAt: start,
    endsAt,
    isAllDay: false,
    timeZone: startZone,
    status: statusOf(event.status),
  };
}

function titleOf(summary: unknown): string {
  return typeof summary === 'string' && summary.trim().length > 0 ? summary : UNTITLED;
}

function statusOf(status: unknown): GoogleEventStatus {
  if (status === 'cancelled' || status === 'tentative' || status === 'confirmed') {
    return status;
  }
  return 'confirmed';
}

function zoneOf(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function civilStart(date: unknown, timeZone: string): string | null {
  const wall = dateWall(date, 0, 0, 0);
  if (wall === null) {
    return null;
  }
  return instantFromWall(wall, timeZone);
}

/** Google's all-day `end.date` is exclusive. Missing end means a single civil day. */
function allDayEnd(endDate: unknown, startDate: unknown, timeZone: string): string | null {
  const exclusive = dateWall(endDate, 0, 0, 0);
  const start = dateWall(startDate, 0, 0, 0);
  if (start === null) {
    return null;
  }
  const last =
    exclusive === null
      ? start
      : addCalendarDays({ ...exclusive, hour: 0, minute: 0, second: 0 }, -1);
  return instantFromWall({ ...last, hour: 23, minute: 59, second: 59 }, timeZone);
}

function dateWall(value: unknown, hour: number, minute: number, second: number): WallClock | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    return null;
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour,
    minute,
    second,
  };
}

function timedInstant(value: unknown, timeZone: string): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(value)) {
    const instant = new Date(value);
    return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (match === null) {
    return null;
  }
  return instantFromWall(
    {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: Number(match[6] ?? '0'),
    },
    timeZone,
  );
}
