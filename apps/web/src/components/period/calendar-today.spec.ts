import { describe, expect, it } from 'vitest';
import { nextMidnight, todayInZone } from './calendar-today';

describe('TTD-AUD-75.7 / RF-604: today in Madrid', () => {
  it('uses the account day before UTC midnight', () => {
    expect(todayInZone(new Date('2026-10-21T22:00:00Z'), 'Europe/Madrid')).toBe('2026-10-22');
  });
  it.each([
    ['2026-10-24T22:00:00Z', '2026-10-25T23:00:00Z'],
    ['2026-03-28T23:00:00Z', '2026-03-29T22:00:00Z'],
  ])('schedules the next local midnight across DST from %s', (now, midnight) => {
    expect(nextMidnight(new Date(now), 'Europe/Madrid')).toBe(Date.parse(midnight));
  });
});
