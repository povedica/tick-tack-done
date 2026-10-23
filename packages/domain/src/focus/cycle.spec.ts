import { autoStartNextPhase } from './cycle';
import { describe, expect, it } from 'vitest';
import {
  focusElapsedSeconds,
  cappedFocusSeconds,
  focusSessionStatus,
  focusStats,
  nextFocusPhase,
  remainingSeconds,
  DEFAULT_FOCUS_SETTINGS,
} from './cycle';

describe('focus', () => {
  it('RF-1201: four finished focus sessions lead to the long break', () => {
    expect(nextFocusPhase('focus', 4, DEFAULT_FOCUS_SETTINGS).type).toBe('long_break');
    expect(nextFocusPhase('focus', 1, DEFAULT_FOCUS_SETTINGS).type).toBe('short_break');
    expect(nextFocusPhase('short_break', 1, DEFAULT_FOCUS_SETTINGS).type).toBe('focus');
  });

  it('RF-1205: remaining time follows the server clock and reaches zero', () => {
    expect(remainingSeconds('2026-10-18T12:00:00.000Z', 25, '2026-10-18T12:10:00.000Z')).toBe(
      15 * 60,
    );
    expect(remainingSeconds('2026-10-18T12:00:00.000Z', 25, '2026-10-18T13:00:00.000Z')).toBe(0);
    expect(remainingSeconds('nope', 25, '2026-10-18T12:00:00.000Z')).toBe(0);
  });

  it('RF-1204: finish never records more than the planned duration', () => {
    expect(cappedFocusSeconds('2026-10-18T08:00:00.000Z', 25, '2026-10-18T12:11:00.000Z')).toBe(
      25 * 60,
    );
    expect(cappedFocusSeconds('2026-10-18T08:00:00.000Z', 25, '2026-10-18T08:10:00.000Z')).toBe(
      10 * 60,
    );
  });

  it('RF-1201: an open session past its plan is expired, not active', () => {
    const base = {
      completed: false,
      startedAt: '2026-10-18T08:00:00.000Z',
      plannedMinutes: 25,
    };
    expect(focusSessionStatus({ ...base, endedAt: null, now: '2026-10-18T08:10:00.000Z' })).toBe(
      'active',
    );
    expect(focusSessionStatus({ ...base, endedAt: null, now: '2026-10-18T12:00:00.000Z' })).toBe(
      'expired',
    );
    expect(
      focusSessionStatus({
        ...base,
        completed: true,
        endedAt: '2026-10-18T08:25:00.000Z',
        now: '2026-10-18T12:00:00.000Z',
      }),
    ).toBe('completed');
    expect(
      focusSessionStatus({
        ...base,
        endedAt: '2026-10-18T08:10:00.000Z',
        now: '2026-10-18T12:00:00.000Z',
      }),
    ).toBe('aborted');
  });

  it('RF-1204: stats sum focus, ignore breaks and pick the busiest hour', () => {
    const stats = focusStats(
      [
        {
          type: 'focus',
          startedAt: '2026-10-18T08:00:00.000Z',
          actualSeconds: 1500,
          completed: true,
          listId: 'list-1',
          tagNames: ['casa'],
        },
        {
          type: 'short_break',
          startedAt: '2026-10-18T08:25:00.000Z',
          actualSeconds: 300,
          completed: true,
          listId: null,
          tagNames: [],
        },
      ],
      0,
    );
    expect(stats.completed_pomodoros).toBe(1);
    expect(stats.focus_seconds).toBe(1500);
    expect(stats.by_tag[0]?.name).toBe('casa');
    expect(stats.best_hour).toBe(8);
    expect(focusStats([]).best_hour).toBeNull();
  });
});

describe('TTD-AUD-78 RF-1204/1205', () => {
  it('freezes at pause and subtracts previous pauses across DST', () => {
    expect(
      focusElapsedSeconds({
        startedAt: '2026-10-25T00:50:00Z',
        now: '2026-10-25T02:00:00Z',
        pausedAt: '2026-10-25T01:20:00Z',
        pausedSeconds: 300,
      }),
    ).toBe(1500);
  });
  it.each(['2026-10-24T22:30:00Z', '2026-03-28T23:30:00Z'])(
    'counts local midnight in Madrid: %s',
    (startedAt) => {
      const result = focusStats(
        [
          {
            type: 'focus',
            startedAt,
            actualSeconds: 900,
            completed: true,
            listId: null,
            tagNames: [],
          },
        ],
        'Europe/Madrid',
        startedAt,
      );
      expect(result.today_pomodoros).toBe(1);
      expect(result.today_focus_seconds).toBe(900);
      expect(result.best_hour).toBe(0);
    },
  );
  it('counts stopwatch duration without counting a pomodoro', () => {
    const result = focusStats(
      [
        {
          type: 'stopwatch',
          startedAt: '2026-10-25T01:20:00Z',
          actualSeconds: 123,
          completed: true,
          listId: null,
          tagNames: [],
        },
      ],
      'Europe/Madrid',
      '2026-10-25T02:00:00Z',
    );
    expect(result.today_pomodoros).toBe(0);
    expect(result.today_focus_seconds).toBe(123);
  });
});

it('TTD-AUD-101 / RF-1201: auto-start follows the completed phase and remains off by default', () => {
  expect(autoStartNextPhase('focus', { autoStartBreaks: false, autoStartFocus: false })).toBe(
    false,
  );
  expect(autoStartNextPhase('focus', { autoStartBreaks: true, autoStartFocus: false })).toBe(true);
  expect(autoStartNextPhase('short_break', { autoStartBreaks: true, autoStartFocus: false })).toBe(
    false,
  );
  expect(autoStartNextPhase('long_break', { autoStartBreaks: false, autoStartFocus: true })).toBe(
    true,
  );
  expect(autoStartNextPhase('stopwatch', { autoStartBreaks: true, autoStartFocus: true })).toBe(
    false,
  );
});
