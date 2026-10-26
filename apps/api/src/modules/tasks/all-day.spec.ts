import { describe, expect, it } from 'vitest';
import { allDayMidnight } from './all-day.js';
describe('TTD-AUD-123 RF-604 all-day normalization', () => {
  it.each([
    ['2026-10-19T13:35:00Z', '2026-10-18T22:00:00.000Z'],
    ['2026-12-19T13:35:00Z', '2026-12-18T23:00:00.000Z'],
  ])('normalizes %s with daylight savings', (input, expected) => {
    expect(allDayMidnight(new Date(input), 'Europe/Madrid')?.toISOString()).toBe(expected);
  });
  it('keeps null and midnight unchanged', () => {
    expect(allDayMidnight(null, 'UTC')).toBeNull();
    expect(allDayMidnight(new Date('2026-10-18T22:00:00Z'), 'Europe/Madrid')?.toISOString()).toBe(
      '2026-10-18T22:00:00.000Z',
    );
  });
});
