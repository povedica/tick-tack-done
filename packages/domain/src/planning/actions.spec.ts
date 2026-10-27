import { describe, expect, it } from 'vitest';
import { alignDueToStart, effectOf, type DueAlignment } from './actions';
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

const current = (dueDate: string | null, durationMinutes: number | null = null): DueAlignment => ({
  startDate: null,
  dueDate,
  isAllDay: true,
  timeZone: 'Europe/Madrid',
  durationMinutes,
});

describe('alignDueToStart', () => {
  it('moves an all-day deadline onto the later start day', () => {
    expect(
      alignDueToStart(current('2026-10-24T22:00:00.000Z'), {
        start_date: '2026-10-29',
        is_all_day: true,
        time_zone: 'Europe/Madrid',
      }),
    ).toBe('2026-10-28T23:00:00.000Z');
  });

  it('moves a timed deadline to start plus duration', () => {
    expect(
      alignDueToStart(current('2026-10-24T22:00:00.000Z', 15), {
        start_date: '2026-10-29T09:00:00.000Z',
        is_all_day: false,
        time_zone: 'Europe/Madrid',
        duration_minutes: 30,
      }),
    ).toBe('2026-10-29T09:30:00.000Z');
    expect(
      alignDueToStart(current('2026-10-24T22:00:00.000Z', 45), {
        start_date: '2026-10-29T09:00:00.000Z',
        is_all_day: false,
        time_zone: 'Europe/Madrid',
      }),
    ).toBe('2026-10-29T09:45:00.000Z');
  });

  it('keeps the deadline when the start day is earlier or the same', () => {
    const later = current('2026-11-04T23:00:00.000Z');
    expect(
      alignDueToStart(later, {
        start_date: '2026-10-28',
        is_all_day: true,
        time_zone: 'Europe/Madrid',
      }),
    ).toBeUndefined();
    expect(
      alignDueToStart(current('2026-10-24T22:00:00.000Z'), {
        start_date: '2026-10-25',
        is_all_day: true,
        time_zone: 'Europe/Madrid',
      }),
    ).toBeUndefined();
    expect(
      alignDueToStart(current(null), {
        start_date: '2026-10-29',
        is_all_day: true,
        time_zone: 'Europe/Madrid',
      }),
    ).toBeUndefined();
  });
});
