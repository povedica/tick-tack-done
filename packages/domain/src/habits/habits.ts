import { addCalendarDays, instantFromWall, wallClock } from '../dates/zoned';
import type { HabitGoal, HabitPeriod, HabitWeekday } from '../types';
import { isIanaTimeZone } from '../tasks/time-zone';

export const HABIT_WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const satisfies readonly HabitWeekday[];

const WEEKDAY_BY_INDEX: readonly HabitWeekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export interface HabitLogEntry {
  readonly date: string;
  readonly count: number;
}

export interface HabitHeatCell {
  readonly date: string;
  readonly count: number;
  readonly met: boolean;
  readonly scheduled: boolean;
}

export interface AggregateHeatCell {
  readonly date: string;
  readonly scheduled: number;
  readonly met: number;
}

export interface HabitStats {
  readonly streakCurrent: number;
  readonly streakBest: number;
  readonly completionPercent: { readonly week: number; readonly month: number };
  readonly heatmap: readonly HabitHeatCell[];
}

export type HabitDraftFailure = 'invalid_goal' | 'invalid_frequency' | 'invalid_reminder';

export type CheckInFailure =
  'inactive_day' | 'future_date' | 'invalid_count' | 'invalid_date' | 'invalid_zone';

export interface HabitHistory {
  readonly from: string;
  readonly to?: string;
  readonly goal: HabitGoal;
  readonly days: readonly HabitWeekday[];
}
export interface NormalizedHabit {
  readonly startDate?: string | null;
  readonly unit?: string | null;
  readonly paused?: boolean;
  readonly history?: readonly HabitHistory[];

  readonly goal: HabitGoal;
  readonly days: readonly HabitWeekday[];
  readonly reminderTime: string | null;
}

export interface CheckInAssessment {
  readonly goalMet: boolean;
  readonly streakBroken: boolean;
}

interface Model {
  readonly goal: HabitGoal;
  readonly days: ReadonlySet<HabitWeekday>;
  readonly logs: ReadonlyMap<string, number>;
  readonly history: readonly HabitHistory[];
  readonly today: string;
}

type WeekState = 'met' | 'open' | 'missed' | 'inactive';

/** Local calendar date (`YYYY-MM-DD`) for an instant in an IANA zone. */
export function calendarDate(now: string, timeZone: string): string | null {
  if (!isIanaTimeZone(timeZone)) {
    return null;
  }
  const wall = wallClock(now, timeZone);
  if (wall === null) {
    return null;
  }
  return formatDate(wall.year, wall.month, wall.day);
}

/** RF-1301. Daily counters store the same number in both goal fields, matching the seed. */
export function normalizeHabitDraft(input: {
  readonly timesPerPeriod: number;
  readonly period: string;
  readonly targetCount: number;
  readonly days: readonly string[];
  readonly reminderTime: string | null;
}): { ok: true; habit: NormalizedHabit } | { ok: false; reason: HabitDraftFailure } {
  if (!isPeriod(input.period) || !isPositiveInt(input.targetCount, 1000)) {
    return { ok: false, reason: 'invalid_goal' };
  }
  const days = normalizeDays(input.days);
  if (days === null) {
    return { ok: false, reason: 'invalid_frequency' };
  }
  if (input.period === 'day') {
    if (input.timesPerPeriod !== input.targetCount) {
      return { ok: false, reason: 'invalid_goal' };
    }
  } else if (!isPositiveInt(input.timesPerPeriod, 7) || input.timesPerPeriod > days.length) {
    return { ok: false, reason: 'invalid_goal' };
  }
  const reminderTime = normalizeReminder(input.reminderTime);
  if (reminderTime === undefined) {
    return { ok: false, reason: 'invalid_reminder' };
  }
  return {
    ok: true,
    habit: {
      goal: {
        timesPerPeriod: input.timesPerPeriod,
        period: input.period,
        targetCount: input.targetCount,
      },
      days,
      reminderTime,
    },
  };
}

/** Reads the JSON stored on Habit (`times_per_period`, weekday names). */
export function readStoredHabit(
  goal: unknown,
  frequency: unknown,
  reminderTime: string | null,
): NormalizedHabit | null {
  if (typeof goal !== 'object' || goal === null || Array.isArray(goal)) {
    return null;
  }
  const row = goal as { times_per_period?: unknown; period?: unknown; target_count?: unknown };
  if (!Array.isArray(frequency)) {
    return null;
  }
  const days: string[] = [];
  for (const day of frequency) {
    if (typeof day !== 'string') {
      return null;
    }
    days.push(day);
  }
  if (typeof row.times_per_period !== 'number' || typeof row.target_count !== 'number') {
    return null;
  }
  if (typeof row.period !== 'string') {
    return null;
  }
  const parsed = normalizeHabitDraft({
    timesPerPeriod: row.times_per_period,
    period: row.period,
    targetCount: row.target_count,
    days,
    reminderTime,
  });
  if (!parsed.ok) return null;
  const raw = (goal as { schedule_history?: unknown }).schedule_history;
  const history: HabitHistory[] = Array.isArray(raw)
    ? raw.flatMap((item: unknown) => {
        if (!item || typeof item !== 'object') return [];
        const row = item as { from?: unknown; to?: unknown; goal?: unknown; days?: unknown };
        if (
          typeof row.from !== 'string' ||
          parseIsoDate(row.from) === null ||
          !Array.isArray(row.days) ||
          !row.goal ||
          typeof row.goal !== 'object'
        )
          return [];
        const days =
          row.days.length === 0
            ? []
            : normalizeDays(row.days.filter((day): day is string => typeof day === 'string'));
        const values = row.goal as {
          timesPerPeriod?: unknown;
          period?: unknown;
          targetCount?: unknown;
        };
        if (
          !days ||
          typeof values.timesPerPeriod !== 'number' ||
          typeof values.targetCount !== 'number' ||
          !isPeriod(String(values.period))
        )
          return [];
        return [
          {
            from: row.from,
            ...(typeof row.to === 'string' ? { to: row.to } : {}),
            days,
            goal: {
              timesPerPeriod: values.timesPerPeriod,
              targetCount: values.targetCount,
              period: values.period as HabitPeriod,
            },
          },
        ];
      })
    : [];
  const extra = goal as { start_date?: unknown; unit?: unknown; paused?: unknown };
  return {
    ...parsed.habit,
    history,
    ...(typeof extra.start_date === 'string' ? { startDate: extra.start_date } : {}),
    ...(typeof extra.unit === 'string' ? { unit: extra.unit } : {}),
    ...(typeof extra.paused === 'boolean' ? { paused: extra.paused } : {}),
  };
}

/** RF-1302 and RF-1305. A goal is met only when this check-in crosses the threshold. */
export function assessCheckIn(input: {
  readonly goal: HabitGoal;
  readonly history?: readonly HabitHistory[];
  readonly days: readonly HabitWeekday[];
  readonly logs: readonly HabitLogEntry[];
  readonly date: string;
  readonly count: number;
  readonly timeZone: string;
  readonly now: string;
}): { ok: true; assessment: CheckInAssessment } | { ok: false; reason: CheckInFailure } {
  if (!Number.isInteger(input.count) || input.count < 0 || input.count > 10_000) {
    return { ok: false, reason: 'invalid_count' };
  }
  const today = calendarDate(input.now, input.timeZone);
  if (today === null) {
    return { ok: false, reason: 'invalid_zone' };
  }
  if (parseIsoDate(input.date) === null) {
    return { ok: false, reason: 'invalid_date' };
  }
  const effective = effectiveHabit(input.goal, input.days, input.history ?? [], input.date);
  const weekday = weekdayOf(input.date);
  if (weekday === null || !effective.days.includes(weekday)) {
    return { ok: false, reason: 'inactive_day' };
  }
  if (input.date > today) {
    return { ok: false, reason: 'future_date' };
  }
  const before = modelOf(input.goal, input.days, input.logs, today, input.history);
  const afterLogs = input.logs
    .filter((log) => log.date !== input.date)
    .concat([{ date: input.date, count: input.count }]);
  const after = modelOf(input.goal, input.days, afterLogs, today, input.history);
  return {
    ok: true,
    assessment: {
      goalMet: !periodMet(before, input.date) && periodMet(after, input.date),
      streakBroken: currentStreak(after) < currentStreak(before),
    },
  };
}

/** RF-1303. Percents use elapsed active days. The heatmap covers the whole year. */
export function habitStats(input: {
  readonly goal: HabitGoal;
  readonly history?: readonly HabitHistory[];
  readonly days: readonly HabitWeekday[];
  readonly logs: readonly HabitLogEntry[];
  readonly timeZone: string;
  readonly now: string;
  readonly year: number;
}): HabitStats | null {
  const today = calendarDate(input.now, input.timeZone);
  const dates = datesInYear(input.year);
  if (today === null || dates === null) {
    return null;
  }
  const model = modelOf(input.goal, input.days, input.logs, today, input.history);
  const monday = mondayOf(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthEnd = formatDate(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)),
    daysInMonth(Number(today.slice(0, 4)), Number(today.slice(5, 7))),
  );
  return {
    streakCurrent: currentStreak(model),
    streakBest: bestStreak(model),
    completionPercent: {
      week: completionPercent(model, monday, addDays(monday, 6)),
      month: completionPercent(model, monthStart, monthEnd),
    },
    heatmap: dates.map((date) => heatCell(model, date)),
  };
}

/** RF-1303. One cell per day, summed across habits. */
export function aggregateHeatmap(input: {
  readonly habits: readonly {
    readonly goal: HabitGoal;
    readonly history?: readonly HabitHistory[];
    readonly days: readonly HabitWeekday[];
    readonly logs: readonly HabitLogEntry[];
  }[];
  readonly year: number;
}): readonly AggregateHeatCell[] | null {
  const dates = datesInYear(input.year);
  if (dates === null) {
    return null;
  }
  return dates.map((date) => {
    let scheduled = 0;
    let met = 0;
    for (const habit of input.habits) {
      const effective = effectiveHabit(habit.goal, habit.days, habit.history ?? [], date);
      const weekday = weekdayOf(date);
      if (weekday === null || !effective.days.includes(weekday)) {
        continue;
      }
      scheduled += 1;
      const count = countOn(habit.logs, date);
      if (count >= effective.goal.targetCount) {
        met += 1;
      }
    }
    return { date, scheduled, met };
  });
}

/**
 * RF-1305. The missed slot that ended a streak, once that slot is fully in the past.
 * Later misses do not emit again.
 */
export function streakBreakOn(input: {
  readonly goal: HabitGoal;
  readonly history?: readonly HabitHistory[];
  readonly days: readonly HabitWeekday[];
  readonly logs: readonly HabitLogEntry[];
  readonly timeZone: string;
  readonly now: string;
}): string | null {
  const today = calendarDate(input.now, input.timeZone);
  if (today === null) {
    return null;
  }
  const model = modelOf(input.goal, input.days, input.logs, today, input.history);
  if (input.goal.period === 'week') {
    const missedMonday = addDays(mondayOf(today), -7);
    const priorMonday = addDays(missedMonday, -7);
    if (
      classifyWeek(missedMonday, model) === 'missed' &&
      classifyWeek(priorMonday, model) === 'met'
    ) {
      return addDays(missedMonday, 6);
    }
    return null;
  }
  const missed = previousScheduled(model, today);
  if (missed === null || metOn(model, missed)) {
    return null;
  }
  const prior = previousScheduled(model, missed);
  if (prior === null || !metOn(model, prior)) {
    return null;
  }
  return missed;
}

/** Next active local clock time strictly after `now`. The scheduler is the only firer. */
export function nextHabitReminder(input: {
  readonly time: string;
  readonly days: readonly HabitWeekday[];
  readonly timeZone: string;
  readonly now: string;
}):
  | { ok: true; fireAt: string }
  | { ok: false; reason: 'invalid_time' | 'invalid_zone' | 'invalid_date' | 'invalid_frequency' } {
  const match = /^(\d{2}):(\d{2})$/.exec(input.time);
  if (match?.[1] === undefined || match[2] === undefined) {
    return { ok: false, reason: 'invalid_time' };
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return { ok: false, reason: 'invalid_time' };
  }
  if (!isIanaTimeZone(input.timeZone)) {
    return { ok: false, reason: 'invalid_zone' };
  }
  if (input.days.length === 0) {
    return { ok: false, reason: 'invalid_frequency' };
  }
  const nowWall = wallClock(input.now, input.timeZone);
  if (nowWall === null) {
    return { ok: false, reason: 'invalid_date' };
  }
  const active = new Set(input.days);
  for (let offset = 0; offset < 8; offset += 1) {
    const wall = addCalendarDays(nowWall, offset);
    const date = formatDate(wall.year, wall.month, wall.day);
    const weekday = weekdayOf(date);
    if (weekday === null || !active.has(weekday)) {
      continue;
    }
    const instant = instantFromWall({ ...wall, hour, minute, second: 0 }, input.timeZone);
    if (instant !== null && Date.parse(instant) > Date.parse(input.now)) {
      return { ok: true, fireAt: instant };
    }
  }
  return { ok: false, reason: 'invalid_date' };
}

function modelOf(
  goal: HabitGoal,
  days: readonly HabitWeekday[],
  logs: readonly HabitLogEntry[],
  today: string,
  history: readonly HabitHistory[] = [],
): Model {
  const counts = new Map<string, number>();
  for (const log of logs) {
    if (parseIsoDate(log.date) !== null && Number.isInteger(log.count) && log.count >= 0) {
      counts.set(log.date, log.count);
    }
  }
  return { goal, days: new Set(days), logs: counts, today, history };
}

function currentStreak(model: Model): number {
  if (model.goal.period === 'week') {
    return currentWeekStreak(model);
  }
  let cursor = model.today;
  if (isScheduled(model, cursor) && !metOn(model, cursor)) {
    cursor = addDays(cursor, -1);
  }
  let streak = 0;
  for (let guard = 0; guard < 20_000; guard += 1) {
    if (isScheduled(model, cursor)) {
      if (!metOn(model, cursor)) {
        break;
      }
      streak += 1;
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function bestStreak(model: Model): number {
  return model.goal.period === 'week' ? bestWeekStreak(model) : bestDayStreak(model);
}

function bestDayStreak(model: Model): number {
  const earliest = earliestLog(model);
  if (earliest === null) {
    return 0;
  }
  let cursor = earliest;
  let run = 0;
  let best = 0;
  for (let guard = 0; cursor <= model.today && guard < 20_000; guard += 1) {
    if (isScheduled(model, cursor)) {
      if (metOn(model, cursor)) {
        run += 1;
        if (run > best) {
          best = run;
        }
      } else {
        run = 0;
      }
    }
    cursor = addDays(cursor, 1);
  }
  return best;
}

function currentWeekStreak(model: Model): number {
  let monday = mondayOf(model.today);
  const current = classifyWeek(monday, model);
  if (current === 'missed') {
    return 0;
  }
  if (current === 'open' || current === 'inactive') {
    monday = addDays(monday, -7);
  }
  let streak = 0;
  for (let guard = 0; guard < 520; guard += 1) {
    if (classifyWeek(monday, model) === 'inactive') {
      monday = addDays(monday, -7);
      continue;
    }
    if (classifyWeek(monday, model) !== 'met') {
      break;
    }
    streak += 1;
    monday = addDays(monday, -7);
  }
  return streak;
}

function bestWeekStreak(model: Model): number {
  const earliest = earliestLog(model);
  if (earliest === null) {
    return 0;
  }
  let monday = mondayOf(earliest);
  const end = mondayOf(model.today);
  let run = 0;
  let best = 0;
  for (let guard = 0; monday <= end && guard < 520; guard += 1) {
    const state = classifyWeek(monday, model);
    if (state === 'met') {
      run += 1;
      if (run > best) {
        best = run;
      }
    } else if (state === 'missed') {
      run = 0;
    }
    monday = addDays(monday, 7);
  }
  return best;
}

/** RF-1303 / RF-2323: arbitrary ranges use the same elapsed-day/weekly-goal model. */
export function habitRangeSummary(input: {
  readonly goal: HabitGoal;
  readonly history?: readonly HabitHistory[];
  readonly days: readonly HabitWeekday[];
  readonly logs: readonly HabitLogEntry[];
  readonly from: string;
  readonly to: string;
  readonly today: string;
}): { done: number; expected: number; percent: number } {
  return rangeSummary(
    modelOf(input.goal, input.days, input.logs, input.today, input.history),
    input.from,
    input.to,
  );
}

function completionPercent(model: Model, start: string, end: string): number {
  return rangeSummary(model, start, end).percent;
}

function rangeSummary(model: Model, start: string, end: string) {
  const until = end < model.today ? end : model.today;
  const weeks = new Set<string>();
  let expected = 0;
  let done = 0;
  for (const date of eachDate(start, until)) {
    if (!isScheduled(model, date)) continue;
    expected += 1;
    weeks.add(mondayOf(date));
    if (metOn(model, date)) done += 1;
  }
  if (model.goal.period === 'week') {
    expected = [...weeks].reduce(
      (sum, monday) =>
        sum +
        effectiveHabit(model.goal, [...model.days], model.history, monday).goal.timesPerPeriod,
      0,
    );
    done = Math.min(done, expected);
  }
  return { done, expected, percent: ratio(done, expected) };
}

function periodMet(model: Model, date: string): boolean {
  if (model.goal.period === 'week') {
    return classifyWeek(mondayOf(date), model) === 'met';
  }
  return metOn(model, date);
}

function classifyWeek(monday: string, model: Model): WeekState {
  let met = 0;
  let remaining = 0;
  let scheduled = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(monday, offset);
    if (!isScheduled(model, date)) {
      continue;
    }
    scheduled += 1;
    if (metOn(model, date)) {
      met += 1;
      continue;
    }
    if (date >= model.today) {
      remaining += 1;
    }
  }
  if (scheduled === 0) return 'inactive';
  if (
    met >= effectiveHabit(model.goal, [...model.days], model.history, monday).goal.timesPerPeriod
  ) {
    return 'met';
  }
  if (
    met + remaining >=
    effectiveHabit(model.goal, [...model.days], model.history, monday).goal.timesPerPeriod
  ) {
    return 'open';
  }
  return 'missed';
}

function heatCell(model: Model, date: string): HabitHeatCell {
  const scheduled = isScheduled(model, date);
  const count = model.logs.get(date) ?? 0;
  return {
    date,
    count,
    scheduled,
    met:
      scheduled &&
      count >= effectiveHabit(model.goal, [...model.days], model.history, date).goal.targetCount,
  };
}

function metOn(model: Model, date: string): boolean {
  return (
    (model.logs.get(date) ?? 0) >=
    effectiveHabit(model.goal, [...model.days], model.history, date).goal.targetCount
  );
}

function isScheduled(model: Model, date: string): boolean {
  const weekday = weekdayOf(date);
  return (
    weekday !== null &&
    effectiveHabit(model.goal, [...model.days], model.history, date).days.includes(weekday)
  );
}

function previousScheduled(model: Model, date: string): string | null {
  let cursor = addDays(date, -1);
  for (let guard = 0; guard < 366; guard += 1) {
    if (isScheduled(model, cursor)) return cursor;
    cursor = addDays(cursor, -1);
  }
  return null;
}

function earliestLog(model: Model): string | null {
  let earliest: string | null = null;
  for (const date of model.logs.keys()) {
    if (earliest === null || date < earliest) {
      earliest = date;
    }
  }
  return earliest;
}

function countOn(logs: readonly HabitLogEntry[], date: string): number {
  let count = 0;
  for (const log of logs) {
    if (log.date === date) {
      count = log.count;
    }
  }
  return count;
}

function eachDate(start: string, end: string): readonly string[] {
  const dates: string[] = [];
  let cursor = start;
  for (let guard = 0; cursor <= end && guard < 732; guard += 1) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function normalizeDays(days: readonly string[]): readonly HabitWeekday[] | null {
  if (days.length === 0) {
    return null;
  }
  const selected = new Set<HabitWeekday>();
  for (const day of days) {
    if (!isWeekday(day)) {
      return null;
    }
    selected.add(day);
  }
  const ordered = HABIT_WEEKDAYS.filter((day) => selected.has(day));
  return ordered.length === 0 ? null : ordered;
}

function normalizeReminder(value: string | null): string | null | undefined {
  if (value === null) {
    return null;
  }
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (match?.[1] === undefined || match[2] === undefined) {
    return undefined;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return undefined;
  }
  return `${match[1]}:${match[2]}`;
}

function isWeekday(value: string): value is HabitWeekday {
  return (HABIT_WEEKDAYS as readonly string[]).includes(value);
}

function isPeriod(value: string): value is HabitPeriod {
  return value === 'day' || value === 'week';
}

function isPositiveInt(value: number, max: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= max;
}

function ratio(met: number, total: number): number {
  if (total === 0) {
    return 100;
  }
  return Math.round((met / total) * 100);
}

function weekdayOf(date: string): HabitWeekday | null {
  const parsed = parseIsoDate(date);
  if (parsed === null) {
    return null;
  }
  const index = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
  return WEEKDAY_BY_INDEX[index] ?? null;
}

function mondayOf(date: string): string {
  const weekday = weekdayOf(date);
  const index = weekday === null ? 0 : HABIT_WEEKDAYS.indexOf(weekday);
  return addDays(date, -index);
}

function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) {
    return null;
  }
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function addDays(date: string, days: number): string {
  const parsed = parseIsoDate(date);
  if (parsed === null) {
    return date;
  }
  const utc = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return formatDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

function datesInYear(year: number): readonly string[] | null {
  if (!Number.isInteger(year) || year < 1970 || year > 2100) {
    return null;
  }
  const count = isLeap(year) ? 366 : 365;
  const dates: string[] = [];
  let cursor = formatDate(year, 1, 1);
  for (let index = 0; index < count; index += 1) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isLeap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function effectiveHabit(
  goal: HabitGoal,
  days: readonly HabitWeekday[],
  history: readonly HabitHistory[],
  date: string,
): { goal: HabitGoal; days: readonly HabitWeekday[] } {
  // Dated snapshots are appended after periods so an existing record keeps its effective settings.
  const match = [...history]
    .reverse()
    .find((item) => item.from <= date && (item.to === undefined || item.to >= date));
  return match ?? { goal, days };
}

/** Add availability periods without rewriting dated log snapshots (RF-1301/1303). */
export function habitAvailabilityHistory(input: {
  readonly history: readonly HabitHistory[];
  readonly goal: HabitGoal;
  readonly days: readonly HabitWeekday[];
  readonly from: string;
  readonly startDate: string | null;
  readonly paused: boolean;
}): readonly HabitHistory[] {
  if (input.startDate !== null && parseIsoDate(input.startDate) === null)
    throw new Error('invalid_start_date');
  const periods = input.history.filter((h) => h.to === undefined && h.from !== input.from);
  const snapshots = input.history.filter(
    (h) => h.to !== undefined && !(h.from === '1970-01-01' && h.days.length === 0),
  );
  return [
    ...periods,
    { from: input.from, goal: input.goal, days: input.paused ? [] : input.days },
    ...(input.startDate
      ? [{ from: '1970-01-01', to: addDays(input.startDate, -1), goal: input.goal, days: [] }]
      : []),
    ...snapshots,
  ];
}
