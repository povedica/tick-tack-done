import { describe, it, expect } from 'vitest';
import {
  achievementAt,
  achievementHistory,
  addCalendarDays,
  ageOnComplete,
  buildDayBuckets,
  completionRate,
  countCompletedCreated,
  dayKey,
  distributionBy,
  focusHeatmap,
  focusMinutesTotal,
  focusPomodoros,
  habitRangePercent,
  averageHabitPercent,
  weakestHabitWeekday,
  focusSeries,
  hourInTz,
  overdueStockSeries,
  parseDayBounds,
  productiveStreak,
  punctualityStats,
  taskSeries,
  weekdayInTz,
  type StatsTaskRow,
  type StatsFocusRow,
  type StatsHabitRow,
} from './aggregate';
import { habitStats } from '../habits/habits';
import { ACHIEVEMENT_LEVELS, achievementScore, priorityBonus } from '../achievements/score';
const tz = 'Europe/Madrid';
const task = (patch: Partial<StatsTaskRow> = {}): StatsTaskRow => ({
  id: 't',
  title: 'Task',
  status: 'completed',
  priority: 'none',
  isAllDay: false,
  createdAt: '2026-10-01T08:00:00Z',
  completedAt: '2026-10-19T10:00:00Z',
  dueDate: '2026-10-19T15:00:00Z',
  listId: 'l',
  listName: 'List',
  listColor: null,
  tagIds: [],
  tagNames: [],
  ...patch,
});
const focus = (patch: Partial<StatsFocusRow> = {}): StatsFocusRow => ({
  id: 'f',
  type: 'focus',
  startedAt: '2026-10-19T10:00:00Z',
  endedAt: '2026-10-19T10:25:00Z',
  actualSeconds: 1500,
  completed: true,
  interruptedCount: 0,
  taskId: null,
  taskTitle: null,
  listId: null,
  listName: null,
  tagNames: [],
  ...patch,
});
const habit: StatsHabitRow = {
  id: 'h',
  name: 'Monday',
  icon: null,
  color: null,
  goal: { targetCount: 1, timesPerPeriod: 1, period: 'day' },
  days: ['monday'],
  logs: [{ date: '2026-10-19', count: 1 }],
};
describe('RF-2321 temporal boundaries', () => {
  it('RF-604: validates before allocating days and respects DST local midnights', () => {
    expect(parseDayBounds('2026-10-25', '2026-10-25', tz)).toMatchObject({
      startIso: '2026-10-24T22:00:00.000Z',
      endIso: '2026-10-25T23:00:00.000Z',
      days: ['2026-10-25'],
    });
    expect(parseDayBounds('2024-02-29', '2024-03-01', 'UTC')?.days).toHaveLength(2);
    for (const [from, to, zone] of [
      ['2026-10-20', '2026-10-19', tz],
      ['2026-02-30', '2026-03-01', tz],
      ['2026-02-01', '2026-02-30', tz],
      ['0001-01-01', '9999-12-31', tz],
      ['x', '2026-01-01', tz],
      ['2026-01-01', '2026-01-02', 'Mars'],
    ])
      expect(parseDayBounds(from ?? '', to ?? '', zone ?? '')).toBeNull();
    expect(dayKey('invalid', tz)).toBeNull();
    expect(dayKey('2026-10-19T22:30:00Z', tz)).toBe('2026-10-20');
    expect(dayKey('2026-10-19T22:30:00Z', 'Mars')).toBeNull();
    expect(hourInTz('2026-10-19T22:30:00Z', tz)).toBe(0);
    expect(hourInTz('bad', 'Mars')).toBeNull();
    expect(weekdayInTz('2026-10-19T22:30:00Z', tz)).toBe(2);
    expect(weekdayInTz('bad', 'Mars')).toBeNull();
    expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addCalendarDays('x', 1)).toBeNull();
  });
  it('RF-2321 D2: planned cohort excludes cancelled and undated completions in every grouping', () => {
    const rows = [
      task(),
      task({ id: 'undated', dueDate: null }),
      task({ id: 'cancelled', status: 'cancelled' }),
      task({ id: 'active', status: 'active', completedAt: null }),
      task({ id: 'outside', dueDate: '2026-11-01T12:00:00Z' }),
    ];
    expect(completionRate(rows, '2026-10-19', '2026-10-19', tz)).toEqual({
      completed: 1,
      planned: 2,
      rate: 50,
    });
    const bucket = buildDayBuckets(['2026-10-19'], rows, [], [], tz)[0];
    expect(bucket).toMatchObject({ completed: 3, planned: 2, completion_completed: 1 });
    for (const group of ['day', 'week', 'month'])
      expect(taskSeries(rows, ['2026-10-19'], tz, group)[0]).toMatchObject({
        rate: 50,
        planned: 2,
        completion_completed: 1,
      });
    expect(completionRate([], '2026-10-19', '2026-10-19', tz).rate).toBeNull();
    expect(taskSeries([], ['2026-10-19'], tz, 'day')[0]?.rate).toBeNull();
    expect(countCompletedCreated(rows, '2026-10-01', '2026-10-20', tz)).toEqual({
      completed: 3,
      created: 4,
    });
  });
  it('RF-2321: weekly buckets count a task completed on a different day of its planned week', () => {
    expect(
      taskSeries(
        [task({ completedAt: '2026-10-20T09:00:00Z' })],
        ['2026-10-19', '2026-10-20'],
        tz,
        'week',
      )[0],
    ).toMatchObject({ date: '2026-10-19', rate: 100 });
  });
  it('RF-2321 / F-03: all-day DST, empty samples and bounded delay outliers', () => {
    const allDay = task({
      isAllDay: true,
      dueDate: '2026-10-24T22:00:00Z',
      completedAt: '2026-10-25T22:30:00Z',
    });
    expect(punctualityStats([allDay], '2026-10-25', '2026-10-25', tz)).toMatchObject({
      on_time: 1,
      sample: 1,
      late: 0,
    });
    expect(punctualityStats([], '2026-10-19', '2026-10-19', tz).on_time_percent).toBeNull();
    const old = task({ dueDate: '2026-01-01T12:00:00Z' });
    expect(punctualityStats([old], '2026-10-19', '2026-10-19', tz)).toMatchObject({
      mean_delay_days: 30,
      median_delay_days: 30,
      capped_samples: 1,
      delay_cap_days: 30,
      sample: 1,
    });
    expect(
      punctualityStats(
        [
          task({ dueDate: null }),
          task({ status: 'cancelled' }),
          task({ completedAt: null }),
          task({ completedAt: '2025-01-01T12:00:00Z' }),
        ],
        '2026-10-19',
        '2026-10-19',
        tz,
      ).sample,
    ).toBe(0);
  });
  it('RF-2321: age ignores invalid order, cancelled, missing and out-of-range completion', () => {
    const rows = [
      task({ createdAt: '2026-10-18T10:00:00Z' }),
      task({ createdAt: '2026-10-17T10:00:00Z' }),
    ];
    expect(ageOnComplete(rows, '2026-10-19', '2026-10-19', tz)).toEqual({
      mean_days: 1.5,
      median_days: 1.5,
      sample: 2,
    });
    expect(
      ageOnComplete(
        [
          task({ createdAt: '2026-11-01T10:00:00Z' }),
          task({ completedAt: null }),
          task({ status: 'cancelled' }),
        ],
        '2026-10-19',
        '2026-10-19',
        tz,
      ).sample,
    ).toBe(0);
  });
  it('RF-2321: historical stock includes later completions, never pre-creation tasks', () => {
    const rows = [
      task({ dueDate: '2026-10-17T10:00:00Z', completedAt: '2026-10-20T10:00:00Z' }),
      task({ id: 'mid', status: 'active', completedAt: null, dueDate: '2026-10-01T10:00:00Z' }),
      task({ id: 'old', status: 'active', completedAt: null, dueDate: '2026-08-01T10:00:00Z' }),
      task({ createdAt: '2026-10-21T10:00:00Z', dueDate: '2026-10-17T10:00:00Z' }),
      task({ status: 'cancelled' }),
      task({ dueDate: null }),
    ];
    expect(overdueStockSeries(rows, ['2026-10-19'], tz)[0]).toEqual({
      date: '2026-10-19',
      under_7: 1,
      days_7_30: 1,
      over_30: 1,
    });
    expect(overdueStockSeries([rows[0] ?? task()], ['2026-10-20'], tz)[0]?.under_7).toBe(0);
  });
  it('RF-2321: productive streak uses today or yesterday, and the best run in that year', () => {
    const rows = ['17', '18', '19'].map((day) => task({ completedAt: `2026-10-${day}T10:00:00Z` }));
    expect(productiveStreak(rows, tz, '2026-10-20')).toEqual({ current: 3, best_year: 3 });
    expect(productiveStreak(rows, tz, '2026-10-22').current).toBe(0);
    expect(
      productiveStreak(
        [task({ completedAt: null }), task({ status: 'cancelled' })],
        tz,
        '2026-10-20',
      ),
    ).toEqual({ current: 0, best_year: 0 });
  });
  it('RF-2321: distributions sort, cap at eight and preserve total in Others', () => {
    const result = distributionBy(
      Array.from({ length: 11 }, (_, index) => ({
        key: String(index),
        label: String(index),
        value: index,
        color: null,
      })),
    );
    expect(result).toHaveLength(9);
    expect(result[result.length - 1]?.key).toBe('other');
    expect(result.reduce((sum, row) => sum + row.value, 0)).toBe(55);
    expect(distributionBy([])).toEqual([]);
  });
});
describe('RF-2322 focus', () => {
  it('RF-2322: retains seconds consistently across totals, days, types and heatmap', () => {
    const rows = [
      focus({ actualSeconds: 29 }),
      focus({ id: 'next', startedAt: '2026-10-20T10:00:00Z', actualSeconds: 29 }),
      focus({ type: 'short_break', actualSeconds: 300 }),
    ];
    expect(focusMinutesTotal(rows)).toBeCloseTo(58 / 60);
    expect(focusPomodoros(rows)).toBe(2);
    const buckets = buildDayBuckets(
      ['2026-10-19', '2026-10-20'],
      [],
      rows.filter((row) => row.type === 'focus'),
      [],
      tz,
    );
    expect(buckets.reduce((sum, row) => sum + row.focus_seconds, 0)).toBe(58);
    expect(buckets.reduce((sum, row) => sum + row.focus_minutes, 0)).toBeCloseTo(
      focusMinutesTotal(rows),
    );
    expect(
      focusHeatmap(
        rows.filter((row) => row.type === 'focus'),
        2026,
        tz,
      ).reduce((sum, row) => sum + row.minutes, 0),
    ).toBeCloseTo(58 / 60);
    expect(buildDayBuckets(['2026-10-19'], [], [rows[2] ?? focus()], [], tz)[0]).toMatchObject({
      focus_minutes: 5,
      pomodoros: 0,
    });
  });
  it('RF-2322: leap year, quartiles, zero days and exclusion of other years', () => {
    const sessions = [1, 2, 3, 4, 8].map((minutes, index) =>
      focus({ startedAt: `2024-01-0${index + 1}T12:00:00Z`, actualSeconds: minutes * 60 }),
    );
    const heat = focusHeatmap([...sessions, focus()], 2024, tz);
    expect(heat).toHaveLength(366);
    expect(new Set(heat.map((cell) => cell.level))).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(focusHeatmap([], 2026, tz)).toHaveLength(365);
  });
});
describe('RF-2323 shared habits', () => {
  it('RF-1303 RF-2323: Monday frequency and weekly goals agree with existing stats', () => {
    const now = '2026-10-20T12:00:00Z';
    const existing = habitStats({ ...habit, timeZone: tz, now, year: 2026 });
    expect(habitRangePercent(habit, '2026-10-19', '2026-10-25', '2026-10-20')).toMatchObject({
      expected: 1,
      done: 1,
      percent: existing?.completionPercent.week,
    });
    const weekly: StatsHabitRow = {
      ...habit,
      days: ['monday', 'tuesday', 'wednesday'],
      goal: { period: 'week', targetCount: 1, timesPerPeriod: 2 },
    };
    expect(habitRangePercent(weekly, '2026-10-19', '2026-10-25', '2026-10-20')).toMatchObject({
      expected: 2,
      done: 1,
      percent: 50,
    });
    expect(
      buildDayBuckets(['2026-10-19', '2026-10-20'], [], [], [habit], tz).map(
        (row) => row.habit_percent,
      ),
    ).toEqual([100, null]);
  });
});
describe('RF-2321 RF-1602 achievement', () => {
  it('RF-2321: public formula, cutoff history, all-day and no negative points', () => {
    const tasks = [
      task(),
      task({ id: 'late', dueDate: '2026-10-01T12:00:00Z' }),
      task({ id: 'future', createdAt: '2027-01-01T12:00:00Z' }),
      task({ status: 'cancelled' }),
      task({ id: 'undated', dueDate: null, priority: 'high' }),
    ];
    const score = achievementAt(
      tasks,
      [focus()],
      [{ date: '2026-10-19', count: 1 }],
      '2026-10-20T12:00:00Z',
      tz,
    );
    expect(score.score).toBe(63);
    expect(
      achievementAt(
        [task({ status: 'active', completedAt: null, dueDate: '2026-01-01T00:00:00Z' })],
        [],
        [],
        '2026-10-20T12:00:00Z',
        tz,
      ).score,
    ).toBe(0);
    const history = achievementHistory(
      tasks,
      [],
      [],
      ['2026-10-18', '2026-10-20'],
      '2026-10-20T12:00:00Z',
      tz,
    );
    expect(history[1]?.score).toBe(40);
    expect(history[0]?.score).toBe(0);
    expect(
      achievementAt(
        [
          task({
            isAllDay: true,
            dueDate: '2026-10-24T22:00:00Z',
            completedAt: '2026-10-25T22:30:00Z',
          }),
        ],
        [],
        [],
        '2026-10-26T12:00:00Z',
        tz,
      ).score,
    ).toBe(10);
  });
  it('RF-2321: all twelve levels and priority weights, including terminal progress', () => {
    for (const [index, level] of ACHIEVEMENT_LEVELS.entries()) {
      const score = achievementScore({ enabled: true, priorityPoints: level.threshold });
      expect(score.level_index).toBe(index);
      expect(score.level).toBe(level.id);
    }
    expect(['high', 'medium', 'low', 'none'].map(priorityBonus)).toEqual([15, 5, 2, 0]);
    expect(achievementScore({ enabled: true, priorityPoints: 10000 }).progress_to_next).toBe(100);
  });
});

describe('RF-2322/2323 shared aggregates', () => {
  it('RF-2322: groups focus by Monday week and month without losing seconds', () => {
    const buckets = buildDayBuckets(
      ['2026-10-19', '2026-10-20'],
      [],
      [
        focus({ actualSeconds: 29 }),
        focus({ id: 'f2', startedAt: '2026-10-20T10:00:00Z', actualSeconds: 29 }),
      ],
      [],
      tz,
    );
    expect(focusSeries(buckets, 'week')).toEqual([
      { date: '2026-10-19', minutes: 58 / 60, pomodoros: 2 },
    ]);
    expect(focusSeries(buckets, 'month')[0]?.date).toBe('2026-10-01');
  });
  it('RF-2323: averages per-habit percentages and counts missing scheduled weekdays', () => {
    expect(averageHabitPercent([], '2026-10-19', '2026-10-25')).toEqual({
      percent: 0,
      done: 0,
      expected: 0,
    });
    expect(averageHabitPercent([habit], '2026-10-19', '2026-10-25')).toEqual({
      percent: 100,
      done: 1,
      expected: 1,
    });
    expect(weakestHabitWeekday(habit, '2026-10-19', '2026-10-25', '2026-10-25')).toBe(1);
    expect(
      weakestHabitWeekday(
        { ...habit, days: ['monday', 'tuesday'] },
        '2026-10-19',
        '2026-10-25',
        '2026-10-25',
      ),
    ).toBe(2);
  });
});
