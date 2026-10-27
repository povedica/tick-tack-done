import { addCalendarDays, instantFromWall, wallClock } from '../dates/zoned';

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface WorkTaskRef {
  readonly projectId: string;
  readonly tagIds: readonly string[];
}

export interface WorkMembership {
  readonly workFolderIds: readonly string[];
  readonly workProjectIds: readonly string[];
  readonly workTagIds: readonly string[];
  readonly folderOf: (projectId: string) => string | null;
}

export interface WorkSchedule {
  readonly start: string | null;
  readonly end: string | null;
  readonly days: readonly number[];
}

export interface WorkHideProfile extends WorkSchedule {
  readonly hideWorkOutsideHours: boolean;
  readonly showWorkUntil: string | null;
  readonly timeZone: string;
}

/** A task is work when its list, its list's folder, or any tag is marked. Work wins. */
export function isWorkTask(task: WorkTaskRef, membership: WorkMembership): boolean {
  if (membership.workProjectIds.includes(task.projectId)) {
    return true;
  }
  const folderId = membership.folderOf(task.projectId);
  if (folderId !== null && membership.workFolderIds.includes(folderId)) {
    return true;
  }
  return task.tagIds.some((tagId) => membership.workTagIds.includes(tagId));
}

/**
 * True during the civil work window. Overnight ranges (22:00–06:00) belong to
 * the weekday on which they started, the same attribution as quiet hours.
 * The end minute is exclusive.
 */
export function isWorkTime(now: string, timeZone: string, schedule: WorkSchedule): boolean {
  if (!validWindow(schedule.start, schedule.end)) {
    return false;
  }
  const wall = wallClock(now, timeZone);
  if (wall === null || schedule.start === null || schedule.end === null) {
    return false;
  }
  const minutes = wall.hour * 60 + wall.minute;
  const start = clockMinutes(schedule.start);
  const end = clockMinutes(schedule.end);
  const overnight = start > end;
  const inside = overnight ? minutes >= start || minutes < end : minutes >= start && minutes < end;
  if (!inside) {
    return false;
  }
  const origin = overnight && minutes < end ? addCalendarDays(wall, -1) : wall;
  const day = new Date(Date.UTC(origin.year, origin.month - 1, origin.day)).getUTCDay();
  return schedule.days.includes(day);
}

/** Next civil start strictly after `now`. Null when the schedule has no future start. */
export function nextWorkStart(
  now: string,
  timeZone: string,
  schedule: WorkSchedule,
): string | null {
  if (schedule.start === null || !CLOCK.test(schedule.start) || schedule.days.length === 0) {
    return null;
  }
  const wall = wallClock(now, timeZone);
  if (wall === null) {
    return null;
  }
  const current = Date.parse(now);
  if (Number.isNaN(current)) {
    return null;
  }
  const [hour, minute] = schedule.start.split(':').map(Number);
  for (let offset = 0; offset < 8; offset += 1) {
    const day = addCalendarDays(wall, offset);
    const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
    if (!schedule.days.includes(weekday)) {
      continue;
    }
    const instant = instantFromWall(
      { ...day, hour: hour ?? 0, minute: minute ?? 0, second: 0 },
      timeZone,
    );
    if (instant !== null && Date.parse(instant) > current) {
      return instant;
    }
  }
  return null;
}

/** Hide work outside the window unless "show work" lasts past `now`. */
export function workHiddenNow(profile: WorkHideProfile, now: string): boolean {
  if (!profile.hideWorkOutsideHours) {
    return false;
  }
  if (isWorkTime(now, profile.timeZone, profile)) {
    return false;
  }
  if (profile.showWorkUntil !== null) {
    const until = Date.parse(profile.showWorkUntil);
    const current = Date.parse(now);
    if (!Number.isNaN(until) && !Number.isNaN(current) && until > current) {
      return false;
    }
  }
  return true;
}

function validWindow(start: string | null, end: string | null): boolean {
  return start !== null && end !== null && start !== end && CLOCK.test(start) && CLOCK.test(end);
}

function clockMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}
