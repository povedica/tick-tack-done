import type { HabitHistory } from '../habits/habits';
import { formatInTimeZone } from 'date-fns-tz';
import { instantFromWall } from '../dates/zoned';
import { controlScore } from '../achievements/score';
import { habitRangeSummary } from '../habits/habits';
import type { HabitGoal, HabitWeekday } from '../types';
import { isIanaTimeZone } from '../tasks/time-zone';

export interface StatsTaskRow {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly isAllDay: boolean;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly dueDate: string | null;
  readonly listId: string;
  readonly listName: string;
  readonly listColor: string | null;
  readonly tagIds: readonly string[];
  readonly tagNames: readonly string[];
}

export interface StatsFocusRow {
  readonly id: string;
  readonly type: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly actualSeconds: number;
  readonly completed: boolean;
  readonly interruptedCount: number;
  readonly taskId: string | null;
  readonly taskTitle: string | null;
  readonly listId: string | null;
  readonly listName: string | null;
  readonly tagNames: readonly string[];
  readonly tagIds?: readonly string[];
  readonly priority?: string;
}

export interface StatsHabitRow {
  readonly history?: readonly HabitHistory[];
  readonly id: string;
  readonly name: string;
  readonly icon: string | null;
  readonly color: string | null;
  readonly goal: HabitGoal;
  readonly days: readonly HabitWeekday[];
  readonly logs: readonly { readonly date: string; readonly count: number }[];
}

export interface DayBucket {
  readonly date: string;
  readonly completed: number;
  readonly created: number;
  readonly planned: number;
  readonly completion_completed: number;
  readonly focus_seconds: number;
  readonly focus_minutes: number;
  readonly pomodoros: number;
  readonly habit_percent: number | null;
}

export function parseDayBounds(
  from: string,
  to: string,
  timeZone: string,
): { startIso: string; endIso: string; days: string[] } | null {
  if (
    !isIanaTimeZone(timeZone) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(to)
  ) {
    return null;
  }
  if (
    from > to ||
    Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 731 * 86400000
  ) {
    return null;
  }
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  if (
    fy === undefined ||
    fm === undefined ||
    fd === undefined ||
    ty === undefined ||
    tm === undefined ||
    td === undefined
  ) {
    return null;
  }
  const startIso = instantFromWall(
    { year: fy, month: fm, day: fd, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
  const last = instantFromWall(
    { year: ty, month: tm, day: td, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
  const endExclusive = addCalendarDays(to, 1);
  if (startIso === null || last === null || endExclusive === null) {
    return null;
  }
  const [ey, em, ed] = endExclusive.split('-').map(Number);
  if (ey === undefined || em === undefined || ed === undefined) {
    return null;
  }
  const endIso = instantFromWall(
    { year: ey, month: em, day: ed, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
  if (endIso === null) {
    return null;
  }
  const days: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    days.push(cursor);
    const next = addCalendarDays(cursor, 1);
    if (next === null) {
      break;
    }
    cursor = next;
  }
  return { startIso, endIso, days };
}

// Pure memoization of calendar projections avoids reformatting the same task in every metric.
// No owner data is cached; keys include the zone and cache size is bounded.
const calendarCache = new Map<string, string | null>();
function calendarPart(iso: string, tz: string, pattern: string): string | null {
  const key = `${tz}|${pattern}|${iso}`;
  if (calendarCache.has(key)) return calendarCache.get(key) ?? null;
  let value: string | null = null;
  if (isIanaTimeZone(tz)) {
    try {
      value = formatInTimeZone(new Date(iso), tz, pattern);
    } catch {
      /* Invalid instant. */
    }
  }
  if (calendarCache.size >= 16384) calendarCache.clear();
  calendarCache.set(key, value);
  return value;
}
export function dayKey(iso: string, timeZone: string): string | null {
  return calendarPart(iso, timeZone, 'yyyy-MM-dd');
}
export function hourInTz(iso: string, timeZone: string): number | null {
  const value = calendarPart(iso, timeZone, 'H');
  return value === null ? null : Number(value);
}
export function weekdayInTz(iso: string, timeZone: string): number | null {
  const value = calendarPart(iso, timeZone, 'i');
  return value === null ? null : Number(value);
}

/** RF-2321: completion rate = completed in range / due in range (TickTick). Cancelled excluded. */
export function completionRate(
  tasks: readonly StatsTaskRow[],
  from: string,
  to: string,
  tz: string,
) {
  let planned = 0;
  let completed = 0;
  for (const task of tasks) {
    if (task.status === 'cancelled') {
      continue;
    }
    if (task.dueDate === null) {
      continue;
    }
    const due = dayKey(task.dueDate, tz);
    if (due === null || due < from || due > to) {
      continue;
    }
    planned += 1;
    if (task.completedAt !== null) {
      const done = dayKey(task.completedAt, tz);
      if (done !== null && done >= from && done <= to) {
        completed += 1;
      }
    }
  }
  return {
    completed,
    planned,
    rate: planned === 0 ? null : Math.round((completed / planned) * 1000) / 10,
  };
}

export function countCompletedCreated(
  tasks: readonly Pick<StatsTaskRow, 'status' | 'createdAt' | 'completedAt'>[],
  from: string,
  to: string,
  tz: string,
  until?: string,
): { completed: number; created: number } {
  let completed = 0;
  let created = 0;
  for (const task of tasks) {
    if (task.status === 'cancelled') {
      continue;
    }
    const createdDay = dayKey(task.createdAt, tz);
    if (
      createdDay !== null &&
      createdDay >= from &&
      createdDay <= to &&
      (until === undefined || Date.parse(task.createdAt) <= Date.parse(until))
    ) {
      created += 1;
    }
    if (task.completedAt !== null) {
      const done = dayKey(task.completedAt, tz);
      if (
        done !== null &&
        done >= from &&
        done <= to &&
        (until === undefined || Date.parse(task.completedAt) <= Date.parse(until))
      ) {
        completed += 1;
      }
    }
  }
  return { completed, created };
}

export function buildDayBuckets(
  days: readonly string[],
  tasks: readonly StatsTaskRow[],
  focus: readonly StatsFocusRow[],
  habits: readonly StatsHabitRow[],
  tz: string,
): DayBucket[] {
  const buckets = new Map(
    days.map((date) => [
      date,
      {
        date,
        completed: 0,
        created: 0,
        planned: 0,
        completion_completed: 0,
        focus_seconds: 0,
        focus_minutes: 0,
        pomodoros: 0,
        habit_percent: habitDayPercent(habits, date),
      },
    ]),
  );
  for (const task of tasks) {
    if (task.status === 'cancelled') continue;
    const created = buckets.get(dayKey(task.createdAt, tz) ?? '');
    const doneDay = task.completedAt === null ? null : dayKey(task.completedAt, tz);
    const done = buckets.get(doneDay ?? '');
    const dueDay = task.dueDate === null ? null : dayKey(task.dueDate, tz);
    const due = buckets.get(dueDay ?? '');
    if (created) created.created += 1;
    if (done) done.completed += 1;
    if (due) {
      due.planned += 1;
      if (doneDay === dueDay) due.completion_completed += 1;
    }
  }
  for (const session of focus) {
    const bucket = buckets.get(dayKey(session.startedAt, tz) ?? '');
    if (!bucket) continue;
    bucket.focus_seconds += session.actualSeconds;
    bucket.focus_minutes = bucket.focus_seconds / 60;
    if (session.type === 'focus' && session.completed) bucket.pomodoros += 1;
  }
  return [...buckets.values()];
}

export function punctualityStats(
  tasks: readonly StatsTaskRow[],
  from: string,
  to: string,
  tz: string,
) {
  const delays: number[] = [];
  let capped = 0;
  let onTime = 0;
  let late = 0;
  for (const task of tasks) {
    if (task.completedAt === null || task.dueDate === null || task.status === 'cancelled') {
      continue;
    }
    const done = dayKey(task.completedAt, tz);
    if (done === null || done < from || done > to) {
      continue;
    }
    const dueMs = Date.parse(task.dueDate);
    const doneMs = Date.parse(task.completedAt);
    if (Number.isNaN(dueMs) || Number.isNaN(doneMs)) {
      continue;
    }
    const dueDay = dayKey(task.dueDate, tz);
    const dueBounds = dueDay === null ? null : parseDayBounds(dueDay, dueDay, tz);
    const dueEnd = task.isAllDay && dueBounds !== null ? Date.parse(dueBounds.endIso) - 1 : dueMs;
    if (doneMs <= dueEnd) {
      onTime += 1;
      delays.push(0);
    } else {
      late += 1;
      const delay = (doneMs - dueEnd) / (24 * 60 * 60 * 1000);
      if (delay > 30) capped += 1;
      delays.push(Math.min(30, delay));
    }
  }
  const total = onTime + late;
  return {
    sample: onTime + late,
    delay_cap_days: 30,
    capped_samples: capped,
    on_time: onTime,
    late,
    on_time_percent: total === 0 ? null : Math.round((onTime / total) * 1000) / 10,
    mean_delay_days: delays.length === 0 ? null : round1(mean(delays)),
    median_delay_days: delays.length === 0 ? null : round1(median(delays)),
  };
}

export function ageOnComplete(
  tasks: readonly StatsTaskRow[],
  from: string,
  to: string,
  tz: string,
) {
  const ages: number[] = [];
  for (const task of tasks) {
    if (task.completedAt === null || task.status === 'cancelled') {
      continue;
    }
    const done = dayKey(task.completedAt, tz);
    if (done === null || done < from || done > to) {
      continue;
    }
    const created = Date.parse(task.createdAt);
    const completed = Date.parse(task.completedAt);
    if (Number.isNaN(created) || Number.isNaN(completed) || completed < created) {
      continue;
    }
    ages.push((completed - created) / (24 * 60 * 60 * 1000));
  }
  return {
    mean_days: ages.length === 0 ? null : round1(mean(ages)),
    median_days: ages.length === 0 ? null : round1(median(ages)),
    sample: ages.length,
  };
}

export function distributionBy(
  items: readonly {
    readonly key: string;
    readonly label: string;
    readonly color: string | null;
    readonly value: number;
  }[],
  limit = 8,
) {
  const sorted = [...items].filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  const other = rest.reduce((sum, item) => sum + item.value, 0);
  const rows = head.map((item) => ({ ...item }));
  if (other > 0) {
    rows.push({ key: 'other', label: 'Otros', color: null, value: other });
  }
  const total = rows.reduce((sum, item) => sum + item.value, 0);
  return rows.map((item) => ({
    ...item,
    percent: total === 0 ? 0 : Math.round((item.value / total) * 1000) / 10,
  }));
}

export function overdueStockSeries(
  tasks: readonly StatsTaskRow[],
  days: readonly string[],
  tz: string,
) {
  const prepared = tasks.map((task) => ({
    task,
    dueDay: task.dueDate === null ? null : dayKey(task.dueDate, tz),
    doneDay: task.completedAt === null ? null : dayKey(task.completedAt, tz),
  }));
  return days.map((date) => {
    let under7 = 0;
    let mid = 0;
    let over30 = 0;
    const bounds = parseDayBounds(date, date, tz);
    const cutMs = Date.parse(bounds?.endIso ?? '') - 1;
    for (const { task, dueDay, doneDay } of prepared) {
      if (
        task.status === 'cancelled' ||
        task.dueDate === null ||
        Date.parse(task.createdAt) > cutMs
      ) {
        continue;
      }
      if (dueDay === null || (task.isAllDay ? dueDay >= date : Date.parse(task.dueDate) > cutMs)) {
        continue;
      }
      if (task.completedAt !== null) {
        const done = doneDay;
        if (done !== null && done <= date) {
          continue;
        }
      }
      const age = Math.floor((cutMs - Date.parse(task.dueDate)) / (24 * 60 * 60 * 1000));
      if (age < 7) {
        under7 += 1;
      } else if (age <= 30) {
        mid += 1;
      } else {
        over30 += 1;
      }
    }
    return { date, under_7: under7, days_7_30: mid, over_30: over30 };
  });
}

export function productiveStreak(
  tasks: readonly StatsTaskRow[],
  tz: string,
  today: string,
): { current: number; best_year: number } {
  const completedDays = new Set<string>();
  for (const task of tasks) {
    if (task.completedAt === null || task.status === 'cancelled') {
      continue;
    }
    const day = dayKey(task.completedAt, tz);
    if (day !== null) {
      completedDays.add(day);
    }
  }
  let current = 0;
  let cursor = completedDays.has(today) ? today : (addCalendarDays(today, -1) ?? today);
  while (completedDays.has(cursor)) {
    current += 1;
    const prev = addCalendarDays(cursor, -1);
    if (prev === null) {
      break;
    }
    cursor = prev;
  }
  const year = today.slice(0, 4);
  let best = 0;
  let run = 0;
  const yearDays = [...completedDays].filter((day) => day.startsWith(year)).sort();
  let prev: string | null = null;
  for (const day of yearDays) {
    if (prev !== null && addCalendarDays(prev, 1) === day) {
      run += 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    prev = day;
  }
  return { current, best_year: best };
}

export function focusMinutesTotal(sessions: readonly StatsFocusRow[]): number {
  let seconds = 0;
  for (const session of sessions) {
    if (session.type === 'focus' || session.type === 'stopwatch') {
      seconds += session.actualSeconds;
    }
  }
  return seconds / 60;
}

export function focusPomodoros(sessions: readonly StatsFocusRow[]): number {
  return sessions.filter((session) => session.type === 'focus' && session.completed).length;
}

export function focusHeatmap(
  sessions: readonly StatsFocusRow[],
  year: number,
  tz: string,
): readonly {
  readonly date: string;
  readonly minutes: number;
  readonly pomodoros: number;
  readonly level: number;
}[] {
  const byDay = new Map<string, { minutes: number; pomodoros: number }>();
  for (const session of sessions) {
    const day = dayKey(session.startedAt, tz);
    if (!day?.startsWith(String(year))) {
      continue;
    }
    const row = byDay.get(day) ?? { minutes: 0, pomodoros: 0 };
    row.minutes += session.actualSeconds / 60;
    if (session.type === 'focus' && session.completed) {
      row.pomodoros += 1;
    }
    byDay.set(day, row);
  }
  const values = [...byDay.values()]
    .map((row) => row.minutes)
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  const q = (p: number) =>
    values.length === 0
      ? 0
      : (values[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0);
  const t1 = q(0.25);
  const t2 = q(0.5);
  const t3 = q(0.75);
  const cells: { date: string; minutes: number; pomodoros: number; level: number }[] = [];
  const start = `${String(year)}-01-01`;
  const end = `${String(year)}-12-31`;
  let cursor = start;
  while (cursor <= end) {
    const row = byDay.get(cursor) ?? { minutes: 0, pomodoros: 0 };
    let level = 0;
    if (row.minutes > 0) {
      if (row.minutes <= t1) {
        level = 1;
      } else if (row.minutes <= t2) {
        level = 2;
      } else if (row.minutes <= t3) {
        level = 3;
      } else {
        level = 4;
      }
    }
    cells.push({ date: cursor, minutes: row.minutes, pomodoros: row.pomodoros, level });
    const next = addCalendarDays(cursor, 1);
    if (next === null) {
      break;
    }
    cursor = next;
  }
  return cells;
}

export function habitRangePercent(habit: StatsHabitRow, from: string, to: string, today = to) {
  return habitRangeSummary({ ...habit, from, to, today });
}

function habitDayPercent(habits: readonly StatsHabitRow[], date: string): number | null {
  const rows = habits.map((habit) => habitRangePercent(habit, date, date));
  const scheduled = rows.filter((row) => row.expected > 0);
  return scheduled.length === 0 ? null : round1(mean(scheduled.map((row) => row.percent)));
}

export function addCalendarDays(day: string, delta: number): string | null {
  const [y, m, d] = day.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return `${String(date.getUTCFullYear())}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? 0;
  }
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** RF-2321: prepare calendar boundaries once, then reconstruct scores without IO. */
export function controlScoreAt(
  tasks: readonly StatsTaskRow[],
  focus: readonly StatsFocusRow[],
  habits: readonly StatsHabitRow[],
  usageDays: ReadonlySet<string>,
  now: string,
  tz: string,
) {
  const cutoff = Date.parse(now);
  const today = dayKey(now, tz) ?? '';
  const from14 = addCalendarDays(today, -13) ?? today;
  const from7 = addCalendarDays(today, -6) ?? today;
  let planned = 0,
    onTime = 0,
    hasDatedTasks = false;
  const overdue = { under7: 0, d8to30: 0, over30: 0 };
  for (const task of tasks) {
    if (task.status === 'cancelled' || task.dueDate === null || Date.parse(task.createdAt) > cutoff)
      continue;
    const dueDay = dayKey(task.dueDate, tz);
    if (dueDay === null) continue;
    hasDatedTasks = true;
    const bounds = task.isAllDay ? parseDayBounds(dueDay, dueDay, tz) : null;
    const end = bounds === null ? Date.parse(task.dueDate) : Date.parse(bounds.endIso) - 1;
    const done = task.completedAt === null ? Infinity : Date.parse(task.completedAt);
    if (dueDay >= from14 && dueDay <= today) {
      planned += 1;
      if (done <= end && done <= cutoff) onTime += 1;
    }
    // History knows only completed_at, not previous edits or deadline changes.
    const activeNow = task.status === 'active' || (done > cutoff && Number.isFinite(done));
    if (activeNow && done > cutoff && end < cutoff) {
      const age = Math.max(0, Math.round((Date.parse(today) - Date.parse(dueDay)) / 86_400_000));
      if (age < 7) overdue.under7 += 1;
      else if (age <= 30) overdue.d8to30 += 1;
      else overdue.over30 += 1;
    }
  }
  let habitDone = 0,
    habitExpected = 0;
  for (const habit of habits) {
    const summary = habitRangeSummary({
      goal: habit.goal,
      days: habit.days,
      logs: habit.logs,
      from: from7,
      to: today,
      today,
    });
    habitDone += summary.done;
    habitExpected += summary.expected;
  }
  const completedFocus = focus.filter(
    (item) =>
      item.type === 'focus' &&
      item.completed &&
      Date.parse(item.endedAt ?? item.startedAt) <= cutoff,
  );
  const pomodoros = completedFocus.filter(
    (item) => (dayKey(item.endedAt ?? item.startedAt, tz) ?? '') >= from7,
  ).length;
  return controlScore({
    hasDatedTasks,
    planned,
    onTime,
    overdue,
    habitDone,
    habitExpected,
    pomodoros,
    lifetimePomodoros: completedFocus.length,
    usageDays: [...usageDays].filter((day) => day >= from7 && day <= today).length,
  });
}
export function achievementHistory(
  tasks: readonly StatsTaskRow[],
  focus: readonly StatsFocusRow[],
  habits: readonly StatsHabitRow[],
  usageDays: ReadonlySet<string>,
  days: readonly string[],
  now: string,
  tz: string,
) {
  const today = dayKey(now, tz);
  return days.map((date) => ({
    date,
    score: controlScoreAt(
      tasks,
      focus,
      habits,
      usageDays,
      date === today
        ? now
        : new Date(Date.parse(parseDayBounds(date, date, tz)?.endIso ?? '') - 1).toISOString(),
      tz,
    ).score,
  }));
}
export function usageStreak(daysWithUse: ReadonlySet<string>, today: string) {
  let cursor = daysWithUse.has(today) ? today : (addCalendarDays(today, -1) ?? today);
  let current = 0;
  while (daysWithUse.has(cursor)) {
    current += 1;
    cursor = addCalendarDays(cursor, -1) ?? '';
  }
  const year = today.slice(0, 4);
  let best_year = 0,
    run = 0,
    previous = '';
  for (const day of [...daysWithUse].filter((day) => day <= today && day.startsWith(year)).sort()) {
    run = addCalendarDays(previous, 1) === day ? run + 1 : 1;
    best_year = Math.max(best_year, run);
    previous = day;
  }
  return { current, best_year };
}

/** RF-2321: grouping preserves the planned cohort instead of dividing unrelated completions. */
export function taskSeries(
  tasks: readonly StatsTaskRow[],
  days: readonly string[],
  tz: string,
  group: string,
) {
  const keys = new Map(days.map((day) => [day, seriesDay(day, group)]));
  const groups = new Map(
    [...keys.values()].map((date) => [
      date,
      { date, completed: 0, created: 0, completion_completed: 0, planned: 0 },
    ]),
  );
  for (const task of tasks) {
    if (task.status === 'cancelled') continue;
    const created = groups.get(keys.get(dayKey(task.createdAt, tz) ?? '') ?? '');
    const doneKey =
      task.completedAt === null ? undefined : keys.get(dayKey(task.completedAt, tz) ?? '');
    const done = groups.get(doneKey ?? '');
    const dueKey = task.dueDate === null ? undefined : keys.get(dayKey(task.dueDate, tz) ?? '');
    const due = groups.get(dueKey ?? '');
    if (created) created.created += 1;
    if (done) done.completed += 1;
    if (due) {
      due.planned += 1;
      if (dueKey === doneKey) due.completion_completed += 1;
    }
  }
  return [...groups.values()].map((row) => ({
    ...row,
    rate: row.planned === 0 ? null : round1((row.completion_completed / row.planned) * 100),
  }));
}

export function averageHabitPercent(
  habits: readonly StatsHabitRow[],
  from: string,
  to: string,
  today = to,
) {
  if (habits.length === 0) {
    return { percent: 0, done: 0, expected: 0 };
  }
  let done = 0;
  let expected = 0;
  for (const habit of habits) {
    const range = habitRangePercent(habit, from, to, today);
    done += range.done;
    expected += range.expected;
  }
  return {
    done,
    expected,
    percent:
      Math.round(
        (habits.reduce((sum, habit) => sum + habitRangePercent(habit, from, to, today).percent, 0) /
          habits.length) *
          10,
      ) / 10,
  };
}

export function weakestHabitWeekday(habit: StatsHabitRow, from: string, to: string, today: string) {
  const days = parseDayBounds(from, to, 'UTC')?.days ?? [];
  const values = Array.from({ length: 7 }, () => ({ done: 0, expected: 0 }));
  for (const date of days) {
    if (date > today) continue;
    const range = habitRangePercent(habit, date, date, today);
    const index = weekdayInTz(`${date}T12:00:00Z`, 'UTC');
    const row = index === null ? undefined : values[index - 1];
    if (row) {
      row.done += range.done;
      row.expected += range.expected;
    }
  }
  const ranked = values
    .map((row, index) => ({ ...row, index: index + 1 }))
    .filter((row) => row.expected > 0)
    .sort((a, b) => a.done / a.expected - b.done / b.expected);
  return ranked[0]?.index ?? null;
}

function seriesDay(day: string, group: string) {
  const index = weekdayInTz(`${day}T12:00:00Z`, 'UTC') ?? 1;
  return group === 'week'
    ? (addCalendarDays(day, -(index - 1)) ?? day)
    : group === 'month'
      ? `${day.slice(0, 7)}-01`
      : day;
}

/** RF-2322: focus grouping sums exact seconds before converting to minutes. */
export function focusSeries(buckets: readonly DayBucket[], group: string) {
  const groups = new Map<string, { date: string; minutes: number; pomodoros: number }>();
  for (const bucket of buckets) {
    const date = seriesDay(bucket.date, group);
    const row = groups.get(date) ?? { date, minutes: 0, pomodoros: 0 };
    row.minutes += bucket.focus_seconds / 60;
    row.pomodoros += bucket.pomodoros;
    groups.set(date, row);
  }
  return [...groups.values()];
}
