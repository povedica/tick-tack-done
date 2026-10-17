import { describe, expect, it } from 'vitest';
import { buildHabitBody, canCreateHabit } from './suggestions';

describe('habit suggestions', () => {
  it('RF-1301: a daily suggestion keeps one counter goal and an optional reminder', () => {
    expect(
      buildHabitBody({
        name: '  Beber agua ',
        period: 'day',
        times: 8,
        days: ['monday', 'sunday'],
        reminderTime: '09:00',
      }),
    ).toEqual({
      name: 'Beber agua',
      goal: { times_per_period: 8, period: 'day', target_count: 8 },
      frequency: ['monday', 'sunday'],
      reminder_time: '09:00',
    });
    expect(
      canCreateHabit({
        name: 'Ejercicio',
        period: 'week',
        times: 4,
        days: ['monday'],
        reminderTime: '',
      }),
    ).toBe(false);
  });
});
