import { formatInTimeZone } from 'date-fns-tz';
import { instantFromWall } from '../dates/zoned';
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
}

export interface StatsHabitRow {
  readonly id: string;
  readonly name: string;
  readonly icon: string | null;
  readonly color: string | null;
  readonly goal: number;
  readonly days: readonly number[];
  readonly logs: readonly { readonly date: string; readonly count: number }[];
}

export interface DayBucket {
  readonly date: string;
  readonly completed: number;
  readonly created: number;
  readonly planned: number;
  readonly focus_minutes: number;
  readonly pomodoros: number;
  readonly habit_percent: number | null;
}

export function parseDayBounds(
  from: string,
  to: string,
  timeZone: string,
): { startIso: string; endIso: string; days: string[] } | null {
  if (!isIanaTimeZone(timeZone) || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return null;
  }
  if (from > to) {
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
  const endExclusive = addCalendarDays(to, 1);
  if (startIso === null || endExclusive === null) {
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

export function dayKey(iso: string, timeZone: string): string | null {
  if (!isIanaTimeZone(timeZone)) {
    return null;
  }
  try {
    return formatInTimeZone(new Date(iso), timeZone, 'yyyy-MM-dd');
  } catch {
    return null;
  }
}

export function hourInTz(iso: string, timeZone: string): number | null {
  if (!isIanaTimeZone(timeZone)) {
    return null;
  }
  try {
    return Number(formatInTimeZone(new Date(iso), timeZone, 'H'));
  } catch {
    return null;
  }
}

export function weekdayInTz(iso: string, timeZone: string): number | null {
  if (!isIanaTimeZone(timeZone)) {
    return null;
  }
  try {
    // 1=Monday … 7=Sunday (ISO)
    return Number(formatInTimeZone(new Date(iso), timeZone, 'i'));
  } catch {
    return null;
  }
}

/** RF-2321: completion rate = completed in range / due in range (TickTick). Cancelled excluded. */
export function completionRate(tasks: readonly StatsTaskRow[], from: string, to: string, tz: string) {
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
  tasks: readonly StatsTaskRow[],
  from: string,
  to: string,
  tz: string,
): { completed: number; created: number } {
  let completed = 0;
  let created = 0;
  for (const task of tasks) {
    if (task.status === 'cancelled') {
      continue;
    }
    const createdDay = dayKey(task.createdAt, tz);
    if (createdDay !== null && createdDay >= from && createdDay <= to) {
      created += 1;
    }
    if (task.completedAt !== null) {
      const done = dayKey(task.completedAt, tz);
      if (done !== null && done >= from && done <= to) {
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
  return days.map((date) => {
    let completed = 0;
    let created = 0;
    let planned = 0;
    for (const task of tasks) {
      if (task.status === 'cancelled') {
        continue;
      }
      if (dayKey(task.createdAt, tz) === date) {
        created += 1;
      }
      if (task.completedAt !== null && dayKey(task.completedAt, tz) === date) {
        completed += 1;
      }
      if (task.dueDate !== null && dayKey(task.dueDate, tz) === date) {
        planned += 1;
      }
    }
    let focusSeconds = 0;
    let pomodoros = 0;
    for (const session of focus) {
      if (session.type !== 'focus') {
        continue;
      }
      if (dayKey(session.startedAt, tz) !== date) {
        continue;
      }
      focusSeconds += session.actualSeconds;
      if (session.completed) {
        pomodoros += 1;
      }
    }
    return {
      date,
      completed,
      created,
      planned,
      focus_minutes: Math.round(focusSeconds / 60),
      pomodoros,
      habit_percent: habitDayPercent(habits, date),
    };
  });
}

export function punctualityStats(
  tasks: readonly StatsTaskRow[],
  from: string,
  to: string,
  tz: string,
) {
  const delays: number[] = [];
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
    const dueEnd = task.isAllDay ? dueMs + 24 * 60 * 60 * 1000 - 1 : dueMs;
    if (doneMs <= dueEnd) {
      onTime += 1;
      delays.push(0);
    } else {
      late += 1;
      delays.push((doneMs - dueEnd) / (24 * 60 * 60 * 1000));
    }
  }
  const total = onTime + late;
  return {
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
  items: readonly { readonly key: string; readonly label: string; readonly color: string | null; readonly value: number }[],
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
  return days.map((date) => {
    let under7 = 0;
    let mid = 0;
    let over30 = 0;
    const cut = `${date}T23:59:59.999Z`;
    const cutMs = Date.parse(cut);
    for (const task of tasks) {
      if (task.status !== 'active' || task.dueDate === null) {
        continue;
      }
      const dueDay = dayKey(task.dueDate, tz);
      if (dueDay === null || dueDay >= date) {
        continue;
      }
      if (task.completedAt !== null) {
        const done = dayKey(task.completedAt, tz);
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
  let cursor = today;
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
    if (session.type === 'focus') {
      seconds += session.actualSeconds;
    }
  }
  return Math.round(seconds / 60);
}

export function focusPomodoros(sessions: readonly StatsFocusRow[]): number {
  return sessions.filter((session) => session.type === 'focus' && session.completed).length;
}

export function focusHeatmap(
  sessions: readonly StatsFocusRow[],
  year: number,
  tz: string,
): readonly { readonly date: string; readonly minutes: number; readonly pomodoros: number; readonly level: number }[] {
  const byDay = new Map<string, { minutes: number; pomodoros: number }>();
  for (const session of sessions) {
    if (session.type !== 'focus') {
      continue;
    }
    const day = dayKey(session.startedAt, tz);
    if (day === null || !day.startsWith(String(year))) {
      continue;
    }
    const row = byDay.get(day) ?? { minutes: 0, pomodoros: 0 };
    row.minutes += Math.round(session.actualSeconds / 60);
    if (session.completed) {
      row.pomodoros += 1;
    }
    byDay.set(day, row);
  }
  const values = [...byDay.values()].map((row) => row.minutes).filter((value) => value > 0).sort((a, b) => a - b);
  const q = (p: number) =>
    values.length === 0 ? 0 : values[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0;
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

export function habitRangePercent(
  habit: StatsHabitRow,
  from: string,
  to: string,
): { percent: number; done: number; expected: number } {
  let expected = 0;
  let done = 0;
  let cursor = from;
  const logMap = new Map(habit.logs.map((log) => [log.date.slice(0, 10), log.count]));
  while (cursor <= to) {
    const weekday = weekdayNumber(cursor); // 0=Sun … 6=Sat matching JS, convert to habit days
    if (habit.days.length === 0 || habit.days.includes(weekday)) {
      expected += 1;
      if ((logMap.get(cursor) ?? 0) >= habit.goal) {
        done += 1;
      }
    }
    const next = addCalendarDays(cursor, 1);
    if (next === null) {
      break;
    }
    cursor = next;
  }
  return {
    done,
    expected,
    percent: expected === 0 ? 0 : Math.round((done / expected) * 1000) / 10,
  };
}

function habitDayPercent(habits: readonly StatsHabitRow[], date: string): number | null {
  if (habits.length === 0) {
    return null;
  }
  let expected = 0;
  let done = 0;
  const weekday = weekdayNumber(date);
  for (const habit of habits) {
    if (habit.days.length > 0 && !habit.days.includes(weekday)) {
      continue;
    }
    expected += 1;
    const count = habit.logs.find((log) => log.date.slice(0, 10) === date)?.count ?? 0;
    if (count >= habit.goal) {
      done += 1;
    }
  }
  if (expected === 0) {
    return null;
  }
  return Math.round((done / expected) * 1000) / 10;
}

function weekdayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) {
    return 0;
  }
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
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
