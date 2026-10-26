import { describe, expect, it } from 'vitest';
import { effectOf } from './actions';
describe('F-AC-2/3 actions', () => {
  it('RF-2640: schedules today and tomorrow without writing deadline or implicit duration', () => {
    expect(effectOf({ action: 'today' }, '2026-10-25', 'Europe/Madrid')).toEqual({
      start_date: '2026-10-25',
      is_all_day: true,
      time_zone: 'Europe/Madrid',
      someday: false,
      evening_only: false,
    });
    expect(effectOf({ action: 'tomorrow' }, '2026-10-25', 'Europe/Madrid')?.start_date).toBe(
      '2026-10-26',
    );
  });
  it('RF-604: resolves time after DST and includes explicit duration', () => {
    expect(
      effectOf(
        { action: 'move', date: '2026-10-26', time: '09:30', duration: 45 },
        '2026-10-25',
        'Europe/Madrid',
      ),
    ).toEqual({
      start_date: '2026-10-26T08:30:00.000Z',
      is_all_day: false,
      time_zone: 'Europe/Madrid',
      someday: false,
      evening_only: false,
      duration_minutes: 45,
    });
    expect(
      effectOf({ action: 'today', time: '09:30' }, '2026-10-25', 'Europe/Madrid')?.duration_minutes,
    ).toBe(30);
  });
  it('F-AC-4: models status changes separately and clears only start for someday', () => {
    for (const action of ['done', 'wont_do', 'delete', 'skip'] as const)
      expect(effectOf({ action }, '2026-10-25', 'Europe/Madrid')).toBeNull();
    expect(effectOf({ action: 'someday' }, '2026-10-25', 'Europe/Madrid')).toEqual({
      someday: true,
      start_date: null,
    });
  });
  it('F-AC-3: rejects missing or impossible date and invalid duration/time', () => {
    for (const choice of [
      { action: 'move' },
      { action: 'move', date: '2026-02-30' },
      { action: 'today', time: '25:00' },
      { action: 'today', duration: 481 },
    ] as const)
      expect(() => effectOf(choice, '2026-10-25', 'Europe/Madrid')).toThrow();
  });
});
