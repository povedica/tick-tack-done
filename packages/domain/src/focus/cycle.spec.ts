import { describe, expect, it } from 'vitest';
import { focusStats, nextFocusPhase, remainingSeconds, DEFAULT_FOCUS_SETTINGS } from './cycle';

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
