import { isIanaTimeZone } from '../tasks/time-zone';
import { instantFromWall, wallClock, type WallClock } from '../dates/zoned';

/** RF-1003. Day, week and month zoom. No task dependencies. */
export type TimelineZoom = 'day' | 'week' | 'month';

export interface TimelineRange {
  readonly from: string;
  readonly to: string;
}

export interface TimelineBlock {
  readonly startDate: string | null;
  readonly dueDate: string | null;
  readonly durationMinutes: number | null;
}

const MINUTE_MS = 60 * 1000;
const MIN_DURATION = 15;

export function timelineRange(
  anchorIso: string,
  zoom: TimelineZoom,
  timeZone: string,
): TimelineRange | null {
  if (!isIanaTimeZone(timeZone)) {
    return null;
  }
  const wall = wallClock(anchorIso, timeZone);
  if (wall === null) {
    return null;
  }
  const start = instantFromWall({ ...wall, hour: 0, minute: 0, second: 0 }, timeZone);
  if (start === null) {
    return null;
  }
  const days = zoom === 'day' ? 1 : zoom === 'week' ? 7 : 31;
  const endWall = addDays(wall, days);
  const end = instantFromWall({ ...endWall, hour: 0, minute: 0, second: 0 }, timeZone);
  if (end === null) {
    return null;
  }
  return { from: start, to: end };
}

export interface MovedBlock {
  readonly startDate: string;
  readonly dueDate: string;
  readonly durationMinutes: number;
}

/** Dragging the block keeps its duration and shifts both edges. */
export function moveTimelineBlock(block: TimelineBlock, deltaMinutes: number): MovedBlock | null {
  const span = blockSpan(block);
  if (span === null) {
    return null;
  }
  const start = span.start + deltaMinutes * MINUTE_MS;
  const due = span.due + deltaMinutes * MINUTE_MS;
  return toMoved(start, due);
}

/** Dragging an edge changes the duration. The other edge stays put. Minimum 15 minutes. */
export function resizeTimelineBlock(
  block: TimelineBlock,
  edge: 'start' | 'end',
  deltaMinutes: number,
): MovedBlock | null {
  const span = blockSpan(block);
  if (span === null) {
    return null;
  }
  const start = edge === 'start' ? span.start + deltaMinutes * MINUTE_MS : span.start;
  const due = edge === 'end' ? span.due + deltaMinutes * MINUTE_MS : span.due;
  if (due - start < MIN_DURATION * MINUTE_MS) {
    return null;
  }
  return toMoved(start, due);
}

/** A click on an empty slot creates a one-hour task at that local time. */
export function slotTask(
  dayIso: string,
  minutesFromMidnight: number,
  timeZone: string,
): MovedBlock | null {
  if (!isIanaTimeZone(timeZone) || minutesFromMidnight < 0 || minutesFromMidnight >= 24 * 60) {
    return null;
  }
  const wall = wallClock(dayIso, timeZone);
  if (wall === null) {
    return null;
  }
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  const start = instantFromWall({ ...wall, hour, minute, second: 0 }, timeZone);
  if (start === null) {
    return null;
  }
  const dueMs = Date.parse(start) + 60 * MINUTE_MS;
  return toMoved(Date.parse(start), dueMs);
}

function blockSpan(block: TimelineBlock): { start: number; due: number } | null {
  const due = block.dueDate === null ? Number.NaN : Date.parse(block.dueDate);
  if (Number.isNaN(due)) {
    return null;
  }
  if (block.startDate !== null) {
    const start = Date.parse(block.startDate);
    if (!Number.isNaN(start) && due > start) {
      return { start, due };
    }
  }
  const minutes = block.durationMinutes ?? 60;
  if (minutes < MIN_DURATION) {
    return null;
  }
  return { start: due - minutes * MINUTE_MS, due };
}

function toMoved(start: number, due: number): MovedBlock {
  return {
    startDate: new Date(start).toISOString(),
    dueDate: new Date(due).toISOString(),
    durationMinutes: Math.round((due - start) / MINUTE_MS),
  };
}

function addDays(wall: WallClock, days: number): WallClock {
  const utc = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + days));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
    hour: wall.hour,
    minute: wall.minute,
    second: 0,
  };
}
