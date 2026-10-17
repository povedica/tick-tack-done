import { describe, expect, it } from 'vitest';
import {
  aggregateHeatmap,
  assessCheckIn,
  calendarDate,
  habitStats,
  nextHabitReminder,
  normalizeHabitDraft,
  readStoredHabit,
  streakBreakOn,
} from './habits';

const MADRID = 'Europe/Madrid';
const NOW = '2026-10-17T10:00:00.000Z';
const WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

describe('habits', () => {
  it('RF-1301: accepts a daily counter and orders the active days', () => {
    const parsed = normalizeHabitDraft({
      timesPerPeriod: 8,
      period: 'day',
      targetCount: 8,
      days: ['sunday', 'monday', 'monday'],
      reminderTime: '09:00',
    });
    expect(parsed).toEqual({
      ok: true,
      habit: {
        goal: { timesPerPeriod: 8, period: 'day', targetCount: 8 },
        days: ['monday', 'sunday'],
        reminderTime: '09:00',
      },
    });
  });

  it('RF-1301: a weekly goal cannot ask for more days than are active', () => {
    expect(
      normalizeHabitDraft({
        timesPerPeriod: 3,
        period: 'week',
        targetCount: 1,
        days: ['monday', 'wednesday'],
        reminderTime: null,
      }).ok,
    ).toBe(false);
    const parsed = normalizeHabitDraft({
      timesPerPeriod: 3,
      period: 'week',
      targetCount: 1,
      days: ['monday', 'wednesday', 'friday'],
      reminderTime: null,
    });
    expect(parsed.ok).toBe(true);
  });

  it('RF-1301: rejects an empty frequency, a bad clock and a daily goal that disagrees with itself', () => {
    expect(
      normalizeHabitDraft({
        timesPerPeriod: 1,
        period: 'day',
        targetCount: 1,
        days: [],
        reminderTime: null,
      }),
    ).toEqual({ ok: false, reason: 'invalid_frequency' });
    expect(
      normalizeHabitDraft({
        timesPerPeriod: 1,
        period: 'day',
        targetCount: 1,
        days: ['monday'],
        reminderTime: '25:00',
      }),
    ).toEqual({ ok: false, reason: 'invalid_reminder' });
    expect(
      normalizeHabitDraft({
        timesPerPeriod: 1,
        period: 'day',
        targetCount: 8,
        days: ['monday'],
        reminderTime: null,
      }),
    ).toEqual({ ok: false, reason: 'invalid_goal' });
    expect(
      normalizeHabitDraft({
        timesPerPeriod: 1,
        period: 'month',
        targetCount: 1,
        days: ['monday'],
        reminderTime: null,
      }),
    ).toEqual({ ok: false, reason: 'invalid_goal' });
  });

  it('RF-1301: reads the seed shape and ignores a corrupt goal', () => {
    expect(
      readStoredHabit({ times_per_period: 8, period: 'day', target_count: 8 }, [...WEEK], '09:00'),
    ).toMatchObject({ goal: { targetCount: 8, period: 'day' }, reminderTime: '09:00' });
    expect(readStoredHabit({ period: 'day' }, ['monday'], null)).toBeNull();
    expect(
      readStoredHabit({ times_per_period: 1, period: 'day', target_count: 1 }, 'monday', null),
    ).toBeNull();
    expect(
      readStoredHabit({ times_per_period: 1, period: 'day', target_count: 1 }, ['lunes'], null),
    ).toBeNull();
  });

  it('RF-1301: the next reminder skips inactive days and stays on the local clock', () => {
    expect(
      nextHabitReminder({
        time: '09:00',
        days: ['saturday'],
        timeZone: MADRID,
        now: '2026-10-17T06:00:00.000Z',
      }),
    ).toEqual({ ok: true, fireAt: '2026-10-17T07:00:00.000Z' });
    expect(
      nextHabitReminder({
        time: '09:00',
        days: ['monday'],
        timeZone: MADRID,
        now: '2026-10-17T08:00:00.000Z',
      }),
    ).toEqual({ ok: true, fireAt: '2026-10-19T07:00:00.000Z' });
    expect(
      nextHabitReminder({ time: '9:00', days: ['monday'], timeZone: MADRID, now: NOW }).ok,
    ).toBe(false);
    expect(nextHabitReminder({ time: '09:00', days: [], timeZone: MADRID, now: NOW })).toEqual({
      ok: false,
      reason: 'invalid_frequency',
    });
    expect(
      nextHabitReminder({ time: '09:00', days: ['monday'], timeZone: 'Mars/Base', now: NOW }),
    ).toEqual({ ok: false, reason: 'invalid_zone' });
    expect(
      nextHabitReminder({ time: '09:00', days: ['monday'], timeZone: MADRID, now: 'not-a-date' }),
    ).toEqual({ ok: false, reason: 'invalid_date' });
  });

  it('RF-1302: a counter meets the day at the target and rejects inactive or future dates', () => {
    const goal = { timesPerPeriod: 8, period: 'day' as const, targetCount: 8 };
    const reached = assessCheckIn({
      goal,
      days: [...WEEK],
      logs: [{ date: '2026-10-17', count: 7 }],
      date: '2026-10-17',
      count: 8,
      timeZone: MADRID,
      now: NOW,
    });
    expect(reached).toEqual({ ok: true, assessment: { goalMet: true, streakBroken: false } });
    expect(
      assessCheckIn({
        goal,
        days: ['monday'],
        logs: [],
        date: '2026-10-17',
        count: 1,
        timeZone: MADRID,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'inactive_day' });
    expect(
      assessCheckIn({
        goal,
        days: [...WEEK],
        logs: [],
        date: '2026-10-18',
        count: 1,
        timeZone: MADRID,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'future_date' });
    expect(
      assessCheckIn({
        goal,
        days: [...WEEK],
        logs: [],
        date: '2026-02-31',
        count: 1,
        timeZone: MADRID,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'invalid_date' });
    expect(
      assessCheckIn({
        goal,
        days: [...WEEK],
        logs: [],
        date: '2026-10-17',
        count: -1,
        timeZone: MADRID,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'invalid_count' });
    expect(
      assessCheckIn({
        goal,
        days: [...WEEK],
        logs: [],
        date: '2026-10-17',
        count: 1,
        timeZone: 'Mars/Base',
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'invalid_zone' });
  });

  it('RF-1303: the current streak skips today until it is met and ignores inactive days', () => {
    const stats = habitStats({
      goal: { timesPerPeriod: 1, period: 'day', targetCount: 1 },
      days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      logs: [
        { date: '2026-10-15', count: 1 },
        { date: '2026-10-16', count: 1 },
      ],
      timeZone: MADRID,
      now: NOW,
      year: 2026,
    });
    expect(stats?.streakCurrent).toBe(2);
    expect(stats?.streakBest).toBe(2);
    expect(calendarDate('2026-10-17T22:30:00.000Z', MADRID)).toBe('2026-10-18');
    expect(stats?.heatmap).toHaveLength(365);
    expect(stats?.heatmap.find((cell) => cell.date === '2026-10-16')).toMatchObject({
      scheduled: true,
      met: true,
      count: 1,
    });
    expect(stats?.heatmap.find((cell) => cell.date === '2026-10-17')).toMatchObject({
      scheduled: false,
      met: false,
    });
  });

  it('RF-1303: a missed active day breaks the streak and a later miss does not start a new one', () => {
    const goal = { timesPerPeriod: 1, period: 'day' as const, targetCount: 1 };
    const days = [...WEEK];
    const logs = [
      { date: '2026-10-14', count: 1 },
      { date: '2026-10-15', count: 1 },
    ];
    const stats = habitStats({ goal, days, logs, timeZone: MADRID, now: NOW, year: 2026 });
    expect(stats?.streakCurrent).toBe(0);
    expect(stats?.streakBest).toBe(2);
    expect(streakBreakOn({ goal, days, logs, timeZone: MADRID, now: NOW })).toBe('2026-10-16');
    expect(
      streakBreakOn({
        goal,
        days,
        logs,
        timeZone: MADRID,
        now: '2026-10-18T10:00:00.000Z',
      }),
    ).toBeNull();
    expect(streakBreakOn({ goal, days, logs: [], timeZone: MADRID, now: NOW })).toBeNull();
    expect(streakBreakOn({ goal, days, logs, timeZone: 'Mars/Base', now: NOW })).toBeNull();
  });

  it('RF-1303: week and month percents count only elapsed active days', () => {
    const stats = habitStats({
      goal: { timesPerPeriod: 1, period: 'day', targetCount: 1 },
      days: ['monday', 'wednesday', 'friday'],
      logs: [
        { date: '2026-10-12', count: 1 },
        { date: '2026-10-14', count: 1 },
      ],
      timeZone: MADRID,
      now: NOW,
      year: 2026,
    });
    expect(stats?.completionPercent.week).toBe(67);
    expect(stats?.completionPercent.month).toBeGreaterThan(0);
    expect(stats?.completionPercent.month).toBeLessThan(100);
  });

  it('RF-1303: a weekly goal streaks by completed weeks and keeps the current week open', () => {
    const goal = { timesPerPeriod: 2, period: 'week' as const, targetCount: 1 };
    const days = ['monday', 'wednesday', 'saturday'] as const;
    const logs = [
      { date: '2026-10-05', count: 1 },
      { date: '2026-10-07', count: 1 },
      { date: '2026-10-12', count: 1 },
    ];
    const stats = habitStats({
      goal,
      days: [...days],
      logs,
      timeZone: MADRID,
      now: NOW,
      year: 2026,
    });
    expect(stats?.streakCurrent).toBe(1);
    expect(stats?.streakBest).toBe(1);
    expect(stats?.completionPercent.week).toBe(50);
    const met = assessCheckIn({
      goal,
      days: [...days],
      logs,
      date: '2026-10-17',
      count: 1,
      timeZone: MADRID,
      now: NOW,
    });
    expect(met).toEqual({ ok: true, assessment: { goalMet: true, streakBroken: false } });
  });

  it('RF-1303: a finished week that misses the goal ends the weekly streak once', () => {
    const goal = { timesPerPeriod: 2, period: 'week' as const, targetCount: 1 };
    const days = ['monday', 'wednesday'] as const;
    const logs = [
      { date: '2026-09-28', count: 1 },
      { date: '2026-09-30', count: 1 },
      { date: '2026-10-05', count: 1 },
    ];
    expect(streakBreakOn({ goal, days: [...days], logs, timeZone: MADRID, now: NOW })).toBe(
      '2026-10-11',
    );
    const stats = habitStats({
      goal,
      days: [...days],
      logs,
      timeZone: MADRID,
      now: NOW,
      year: 2026,
    });
    expect(stats?.streakCurrent).toBe(0);
    expect(stats?.streakBest).toBe(1);
  });

  it('RF-1303: the annual map has a leap day and the aggregate counts scheduled habits', () => {
    const leap = habitStats({
      goal: { timesPerPeriod: 1, period: 'day', targetCount: 1 },
      days: [...WEEK],
      logs: [],
      timeZone: MADRID,
      now: '2024-02-29T12:00:00.000Z',
      year: 2024,
    });
    expect(leap?.heatmap).toHaveLength(366);
    expect(leap?.heatmap.find((cell) => cell.date === '2024-02-29')?.scheduled).toBe(true);
    const aggregate = aggregateHeatmap({
      year: 2026,
      habits: [
        {
          goal: { timesPerPeriod: 1, period: 'day', targetCount: 1 },
          days: ['saturday'],
          logs: [{ date: '2026-10-17', count: 1 }],
        },
        {
          goal: { timesPerPeriod: 1, period: 'day', targetCount: 1 },
          days: ['saturday'],
          logs: [],
        },
      ],
    });
    expect(aggregate?.find((cell) => cell.date === '2026-10-17')).toEqual({
      date: '2026-10-17',
      scheduled: 2,
      met: 1,
    });
    expect(aggregateHeatmap({ year: 1800, habits: [] })).toBeNull();
    expect(
      habitStats({
        goal: { timesPerPeriod: 1, period: 'day', targetCount: 1 },
        days: [...WEEK],
        logs: [],
        timeZone: MADRID,
        now: NOW,
        year: 1800,
      }),
    ).toBeNull();
  });

  it('RF-1305: lowering a counted day below the target breaks the streak, a repeat check-in does not', () => {
    const goal = { timesPerPeriod: 1, period: 'day' as const, targetCount: 1 };
    const broken = assessCheckIn({
      goal,
      days: [...WEEK],
      logs: [
        { date: '2026-10-16', count: 1 },
        { date: '2026-10-17', count: 1 },
      ],
      date: '2026-10-17',
      count: 0,
      timeZone: MADRID,
      now: NOW,
    });
    expect(broken).toEqual({ ok: true, assessment: { goalMet: false, streakBroken: true } });
    const again = assessCheckIn({
      goal,
      days: [...WEEK],
      logs: [{ date: '2026-10-17', count: 1 }],
      date: '2026-10-17',
      count: 2,
      timeZone: MADRID,
      now: NOW,
    });
    expect(again).toEqual({ ok: true, assessment: { goalMet: false, streakBroken: false } });
  });

  it('RF-1303: an empty history is a zero streak and a full percent before the first active day', () => {
    const stats = habitStats({
      goal: { timesPerPeriod: 1, period: 'day', targetCount: 1 },
      days: ['sunday'],
      logs: [
        { date: 'not-a-date', count: 1 },
        { date: '2026-10-18', count: -1 },
      ],
      timeZone: MADRID,
      now: NOW,
      year: 2026,
    });
    expect(stats?.streakCurrent).toBe(0);
    expect(stats?.streakBest).toBe(0);
    expect(stats?.completionPercent.week).toBe(100);
  });
});
