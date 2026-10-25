import { instantFromWall, wallClock } from '../dates/zoned';

export type DayLoadStatus = 'ok' | 'tight' | 'overload';

export interface DayLoadTask {
  readonly id: string;
  readonly durationMinutes: number | null;
  readonly startDate?: string | null;
  readonly dueDate?: string | null;
  readonly isAllDay: boolean;
  readonly eveningOnly: boolean;
  readonly status: string;
  readonly isSomeday?: boolean;
  readonly parentId?: string | null;
}

export interface DayLoadEvent {
  readonly id: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly isAllDay: boolean;
}

export interface DayLoadSettings {
  readonly workDayStart: string | null;
  readonly workDayEnd: string | null;
  readonly defaultTaskDuration: number;
  readonly workDays?: readonly number[];
}

export interface DayLoadResult {
  readonly taskMinutes: number;
  readonly eventMinutes: number;
  readonly availableMinutes: number | null;
  readonly unestimatedCount: number;
  readonly unestimatedTaskIds: readonly string[];
  readonly ratio: number | null;
  readonly status: DayLoadStatus;
}

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** RF-2640. Active root tasks of the day, minus evening and someday, plus event overlap. */
export function dayLoad(input: {
  readonly date: string;
  readonly timeZone: string;
  readonly tasks: readonly DayLoadTask[];
  readonly events: readonly DayLoadEvent[];
  readonly settings: DayLoadSettings;
}): DayLoadResult {
  const window = workWindow(input.date, input.timeZone, input.settings);
  const counted = input.tasks.filter(countsTowardLoad);
  const unestimated = counted.filter((task) => task.durationMinutes === null);
  const taskMinutes = counted.reduce(
    (sum, task) => sum + perDayMinutes(task, input.date, input.timeZone, input.settings),
    0,
  );
  const eventMinutes =
    window === null
      ? 0
      : input.events.reduce((sum, event) => sum + overlapMinutes(event, window), 0);
  if (window === null) {
    return {
      taskMinutes,
      eventMinutes,
      availableMinutes: null,
      unestimatedCount: unestimated.length,
      unestimatedTaskIds: unestimated.map((task) => task.id),
      ratio: null,
      status: 'ok',
    };
  }
  const used = taskMinutes + eventMinutes;
  const ratio = window.availableMinutes === 0 ? (used > 0 ? 2 : 0) : used / window.availableMinutes;
  return {
    taskMinutes,
    eventMinutes,
    availableMinutes: window.availableMinutes,
    unestimatedCount: unestimated.length,
    unestimatedTaskIds: unestimated.map((task) => task.id),
    ratio,
    status: loadStatus(ratio),
  };
}

export function loadStatus(ratio: number): DayLoadStatus {
  if (ratio <= 0.85) {
    return 'ok';
  }
  if (ratio <= 1) {
    return 'tight';
  }
  return 'overload';
}

/** RF-2644. Omitted by the caller when the workday is off or there is nothing to count. */
export function formatDayLoadLine(input: {
  readonly taskCount: number;
  readonly taskMinutes: number;
  readonly eventMinutes: number;
  readonly availableMinutes: number;
}): string {
  return `Hoy: ${String(input.taskCount)} tareas (~${formatMinutes(input.taskMinutes)}) + ${formatMinutes(input.eventMinutes)} de agenda, de ${formatMinutes(input.availableMinutes)} de jornada.`;
}

export function formatMinutes(total: number): string {
  const minutes = Math.max(0, Math.round(total));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${String(rest)} min`;
  }
  if (rest === 0) {
    return `${String(hours)} h`;
  }
  return `${String(hours)} h ${String(rest)} min`;
}

export function civilDateKey(iso: string, timeZone: string): string | null {
  const wall = wallClock(iso, timeZone);
  if (wall === null) {
    return null;
  }
  return padDate(wall.year, wall.month, wall.day);
}

export function shiftCivilDate(date: string, days: number): string {
  const parts = date.split('-').map((part) => Number(part));
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return padDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

export function isBusinessDay(
  date: string,
  workDays: readonly number[] = [1, 2, 3, 4, 5],
): boolean {
  const parts = date.split('-').map((part) => Number(part));
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return workDays.includes(weekday);
}

function countsTowardLoad(task: DayLoadTask): boolean {
  if (task.status !== 'active' || task.eveningOnly || task.isSomeday === true) {
    return false;
  }
  return task.parentId === undefined || task.parentId === null;
}

interface Window {
  readonly startMs: number;
  readonly endMs: number;
  readonly availableMinutes: number;
}

function workWindow(date: string, timeZone: string, settings: DayLoadSettings): Window | null {
  if (
    !isBusinessDay(date, settings.workDays) ||
    settings.workDayStart === null ||
    settings.workDayEnd === null
  ) {
    return null;
  }
  const start = clockMinutes(settings.workDayStart);
  const end = clockMinutes(settings.workDayEnd);
  if (start === null || end === null || end <= start) {
    return null;
  }
  const parts = date.split('-').map((part) => Number(part));
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (year === undefined || month === undefined || day === undefined) {
    return null;
  }
  const startIso = instantFromWall(
    { year, month, day, hour: Math.floor(start / 60), minute: start % 60, second: 0 },
    timeZone,
  );
  const endIso = instantFromWall(
    { year, month, day, hour: Math.floor(end / 60), minute: end % 60, second: 0 },
    timeZone,
  );
  if (startIso === null || endIso === null) {
    return null;
  }
  return {
    startMs: Date.parse(startIso),
    endMs: Date.parse(endIso),
    availableMinutes: end - start,
  };
}

function overlapMinutes(event: DayLoadEvent, window: Window): number {
  if (event.isAllDay) {
    return 0;
  }
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return 0;
  }
  const overlap = Math.min(end, window.endMs) - Math.max(start, window.startMs);
  if (overlap <= 0) {
    return 0;
  }
  return Math.round(overlap / 60_000);
}

function clockMinutes(value: string): number | null {
  const match = CLOCK.exec(value);
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function padDate(year: number, month: number, day: number): string {
  return `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** F-AC-1 / RF-2640: a multi-day interval contributes only its overlap with this workday. */
export function perDayMinutes(
  task: DayLoadTask,
  date: string,
  timeZone: string,
  settings: DayLoadSettings,
): number {
  if (
    task.startDate &&
    task.dueDate &&
    civilDateKey(task.startDate, timeZone) !== civilDateKey(task.dueDate, timeZone) &&
    Date.parse(task.dueDate) > Date.parse(task.startDate)
  ) {
    if (task.isAllDay) return settings.defaultTaskDuration;
    const window = workWindow(date, timeZone, settings);
    return window === null
      ? 0
      : overlapMinutes(
          { id: task.id, startsAt: task.startDate, endsAt: task.dueDate, isAllDay: false },
          window,
        );
  }
  return task.durationMinutes ?? settings.defaultTaskDuration;
}
