import { createHash } from 'node:crypto';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/** Synthetic calendar year used by the perf seed. 2026 is not a leap year. */
export const PERF_YEAR = 2026;
export const PERF_ZONE = 'Europe/Madrid';
export const SENTINEL_DAY = '2026-01-05';
export const SENTINEL_TITLE = 'PERF-SENTINEL';
export const TASK_PAGE_SIZE = 100;
/** One events call, one projects call, one subscriptions call, plus task pages. */
export const EXTRA_YEAR_REQUESTS = 3;
export const PRODUCTION_RATE_LIMIT = 1000;

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export interface PerfProfile {
  readonly name: 's' | 'x100';
  readonly tasks: number;
  readonly events: number;
  readonly projects: number;
  readonly series: number;
}

export const PROFILE_S: PerfProfile = {
  name: 's',
  tasks: 70,
  events: 100,
  projects: 4,
  series: 1,
};

export const PROFILE_X100: PerfProfile = {
  name: 'x100',
  tasks: 6600,
  events: 35_000,
  projects: 40,
  series: 50,
};

export function profileByName(name: string): PerfProfile {
  if (name === 's') {
    return PROFILE_S;
  }
  if (name === 'x100') {
    return PROFILE_X100;
  }
  throw new Error('PERF_PROFILE must be s or x100');
}

export interface YearWindow {
  readonly dueAfter: string;
  readonly dueBefore: string;
}

/** Same bounds as yearQueryRange when the browser zone is Europe/Madrid. */
export function yearWindow(year = PERF_YEAR): YearWindow {
  const start = fromZonedTime(`${String(year)}-01-01 00:00:00`, PERF_ZONE);
  const end = fromZonedTime(`${String(year + 1)}-01-01 00:00:00`, PERF_ZONE);
  return {
    dueAfter: new Date(start.getTime() - 1).toISOString(),
    dueBefore: end.toISOString(),
  };
}

export function requestsPerYearOpen(taskCount: number): number {
  return Math.ceil(taskCount / TASK_PAGE_SIZE) + EXTRA_YEAR_REQUESTS;
}

/** Completeness walk plus repeated opens. Stays inside 1 000 requests / 15 min. */
export function baselineOpens(taskCount: number): number {
  const perOpen = requestsPerYearOpen(taskCount);
  const room = Math.floor(PRODUCTION_RATE_LIMIT / perOpen) - 1;
  return Math.max(1, Math.min(8, room));
}

export interface TaskFixture {
  readonly id: string;
  readonly projectIndex: number;
  readonly title: string;
  readonly due: Date;
  readonly start: Date | null;
  readonly seriesId: string | null;
  readonly repeatRule: string | null;
  readonly sortOrder: bigint;
}

export interface EventFixture {
  readonly id: string;
  readonly uid: string;
  readonly title: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly allDay: boolean;
  readonly multiDay: boolean;
}

export interface ProjectFixture {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly isInbox: boolean;
  readonly sortOrder: bigint;
}

export interface PerfFixture {
  readonly profile: PerfProfile;
  readonly yearWindow: YearWindow;
  readonly projects: readonly ProjectFixture[];
  readonly tasks: readonly TaskFixture[];
  readonly events: readonly EventFixture[];
  readonly sentinelTaskId: string;
  readonly counts: {
    readonly startDiffers: number;
    readonly multiDayTasks: number;
    readonly series: number;
    readonly allDayEvents: number;
    readonly multiDayEvents: number;
  };
}

const COLORS = ['#4f46e5', '#0f766e', '#b45309', '#be123c', '#0369a1', '#65a30d'] as const;

export function buildPerfFixture(profile: PerfProfile): PerfFixture {
  const projects = buildProjects(profile.projects);
  const tasks = buildTasks(profile);
  const events = buildEvents(profile.events);
  const sentinel = tasks.find((task) => task.title === SENTINEL_TITLE);
  if (sentinel === undefined) {
    throw new Error('perf fixture is missing the sentinel task');
  }
  return {
    profile,
    yearWindow: yearWindow(),
    projects,
    tasks,
    events,
    sentinelTaskId: sentinel.id,
    counts: {
      startDiffers: tasks.filter((task) => task.start !== null).length,
      multiDayTasks: tasks.filter(
        (task) => task.start !== null && civilDay(task.start) !== civilDay(task.due),
      ).length,
      series: tasks.filter((task) => task.seriesId !== null).length,
      allDayEvents: events.filter((event) => event.allDay).length,
      multiDayEvents: events.filter((event) => event.multiDay).length,
    },
  };
}

export function perfId(kind: string, index: number): string {
  const hash = createHash('sha256')
    .update(`perf-f1:${kind}:${String(index)}`)
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  const sixth = bytes[6] ?? 0;
  const eighth = bytes[8] ?? 0;
  bytes[6] = (sixth & 0x0f) | 0x40;
  bytes[8] = (eighth & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function civilDay(date: Date): string {
  return formatInTimeZone(date, PERF_ZONE, 'yyyy-MM-dd');
}

export function atMadrid(day: string, hour: number, minute: number, second = 0): Date {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  const ss = String(second).padStart(2, '0');
  return fromZonedTime(`${day} ${hh}:${mm}:${ss}`, PERF_ZONE);
}

function buildProjects(count: number): ProjectFixture[] {
  return Array.from({ length: count }, (_, index) => ({
    id: perfId('project', index),
    name: index === 0 ? 'Bandeja de entrada' : `Perf ${String(index).padStart(2, '0')}`,
    color: COLORS[index % COLORS.length] ?? COLORS[0],
    isInbox: index === 0,
    sortOrder: BigInt(index + 1) * 65536n,
  }));
}

function buildTasks(profile: PerfProfile): TaskFixture[] {
  const multiDayCount = Math.round(profile.tasks * 0.05);
  const startDiffCount = Math.round(profile.tasks * 0.1);
  const pool = civilDays(PERF_YEAR).filter((day) => day !== SENTINEL_DAY);
  const tasks: TaskFixture[] = [];
  let plainSeen = 0;
  for (let index = 0; index < profile.tasks - 1; index += 1) {
    const multiDay = index < multiDayCount;
    const sameDayDiff = !multiDay && index < startDiffCount;
    const day = pool[index % pool.length] ?? pool[0];
    if (day === undefined) {
      throw new Error('perf fixture has no calendar days');
    }
    const placed = placeTask(day, multiDay);
    const series = !multiDay && !sameDayDiff && plainSeen < profile.series;
    if (!multiDay && !sameDayDiff) {
      plainSeen += 1;
    }
    tasks.push({
      id: perfId('task', index),
      projectIndex: index % profile.projects,
      title: `Perf task ${String(index)}`,
      due: placed.due,
      start: multiDay || sameDayDiff ? placed.start : null,
      seriesId: series ? perfId('series', plainSeen - 1) : null,
      repeatRule: series ? 'FREQ=WEEKLY' : null,
      sortOrder: BigInt(index + 1) * 65536n,
    });
  }
  tasks.push({
    id: perfId('task', profile.tasks - 1),
    projectIndex: 0,
    title: SENTINEL_TITLE,
    due: atMadrid(SENTINEL_DAY, 9, 0),
    start: null,
    seriesId: null,
    repeatRule: null,
    sortOrder: BigInt(profile.tasks) * 65536n,
  });
  return tasks;
}

function placeTask(day: string, multiDay: boolean): { start: Date; due: Date } {
  if (!multiDay) {
    return { start: atMadrid(day, 9, 0), due: atMadrid(day, 11, 0) };
  }
  let startDay = day;
  let dueDay = addDays(startDay, 2);
  if (!insideYear(dueDay) || dueDay === SENTINEL_DAY || startDay === SENTINEL_DAY) {
    startDay = addDays(SENTINEL_DAY, -3);
    dueDay = addDays(startDay, 2);
  }
  return { start: atMadrid(startDay, 9, 0), due: atMadrid(dueDay, 18, 0) };
}

function buildEvents(count: number): EventFixture[] {
  const multiDayCount = Math.round(count * 0.03);
  const allDayCount = Math.round(count * 0.2);
  const pool = civilDays(PERF_YEAR).filter((day) => day !== SENTINEL_DAY);
  const events: EventFixture[] = [];
  for (let index = 0; index < count; index += 1) {
    const multiDay = index < multiDayCount;
    const allDay = index < allDayCount;
    const day = pool[index % pool.length] ?? pool[0];
    if (day === undefined) {
      throw new Error('perf fixture has no calendar days');
    }
    events.push(eventAt(index, day, allDay, multiDay));
  }
  replaceWithDst(events);
  return events;
}

function eventAt(index: number, day: string, allDay: boolean, multiDay: boolean): EventFixture {
  if (allDay) {
    const span = multiDay ? 2 : 1;
    const startDay = avoidSentinel(day, span);
    const endDay = addDays(startDay, span);
    return {
      id: perfId('event', index),
      uid: `perf-${String(index)}`,
      title: `Perf event ${String(index)}`,
      startsAt: atMadrid(startDay, 0, 0),
      endsAt: atMadrid(endDay, 0, 0),
      allDay: true,
      multiDay,
    };
  }
  const startDay = avoidSentinel(day, 1);
  return {
    id: perfId('event', index),
    uid: `perf-${String(index)}`,
    title: `Perf event ${String(index)}`,
    startsAt: atMadrid(startDay, 10, 0),
    endsAt: atMadrid(startDay, 11, 0),
    allDay: false,
    multiDay: false,
  };
}

/** Spring-forward and fall-back instants replace two timed events. */
function replaceWithDst(events: EventFixture[]): void {
  const timed = events.filter((event) => !event.allDay);
  const spring = timed[0];
  const autumn = timed[1];
  if (spring === undefined || autumn === undefined) {
    throw new Error('perf fixture needs two timed events for the clock changes');
  }
  const springIndex = events.indexOf(spring);
  const autumnIndex = events.indexOf(autumn);
  events[springIndex] = {
    ...spring,
    title: 'Perf DST spring',
    startsAt: atMadrid('2026-03-29', 1, 30),
    endsAt: atMadrid('2026-03-29', 3, 30),
  };
  events[autumnIndex] = {
    ...autumn,
    title: 'Perf DST autumn',
    startsAt: atMadrid('2026-10-25', 1, 30),
    endsAt: atMadrid('2026-10-25', 2, 30),
  };
}

function avoidSentinel(day: string, spanDays: number): string {
  const pool = civilDays(PERF_YEAR);
  const startIndex = Math.max(0, pool.indexOf(day));
  for (let hop = 0; hop < pool.length; hop += 1) {
    const start = pool[(startIndex + hop) % pool.length];
    if (start === undefined) {
      continue;
    }
    const covered: string[] = [];
    for (let offset = 0; offset < spanDays; offset += 1) {
      covered.push(addDays(start, offset));
    }
    const end = addDays(start, spanDays);
    if (covered.every((item) => item !== SENTINEL_DAY && insideYear(item)) && insideYear(end)) {
      return start;
    }
  }
  throw new Error('perf fixture could not place an event off the sentinel day');
}

function civilDays(year: number): string[] {
  const days: string[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const length = MONTH_LENGTHS[month - 1] ?? 30;
    for (let day = 1; day <= length; day += 1) {
      days.push(
        `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      );
    }
  }
  return days;
}

function addDays(isoDay: string, days: number): string {
  const [year, month, day] = isoDay.split('-').map((part) => Number(part));
  const utc = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, (day ?? 1) + days));
  return utc.toISOString().slice(0, 10);
}

function insideYear(isoDay: string): boolean {
  return isoDay >= `${String(PERF_YEAR)}-01-01` && isoDay <= `${String(PERF_YEAR)}-12-31`;
}

/** Refuses every database that is not the disposable perf database on the local machine. */
export function assertEphemeralDatabase(url: string, confirm: string | undefined): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('seed-perf: DATABASE_URL is not a postgres URL');
  }
  const host = parsed.hostname;
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const local =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === 'host.docker.internal' ||
    host === 'perf-pg';
  if (!local || name !== 'reflexionia_perf') {
    throw new Error(
      `seed-perf refuses ${host}/${name}. Only localhost and database reflexionia_perf.`,
    );
  }
  if (confirm !== 'ephemeral') {
    throw new Error('seed-perf: set PERF_SEED=ephemeral to confirm this database is disposable');
  }
}

export function eventCoversDay(event: EventFixture, day: string): boolean {
  const start = civilDay(event.startsAt);
  const end = civilDay(new Date(event.endsAt.getTime() - 1));
  return day >= start && day <= end;
}
