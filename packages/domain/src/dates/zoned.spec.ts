import { describe, expect, it } from 'vitest';
import { instantFromWall } from './zoned';

describe('instantFromWall', () => {
  it('Q.6: a missing Europe/Madrid wall time moves forward by the spring gap', () => {
    expect(
      instantFromWall(
        { year: 2026, month: 3, day: 29, hour: 2, minute: 30, second: 0 },
        'Europe/Madrid',
      ),
    ).toBe('2026-03-29T01:30:00.000Z');
  });

  it('Q.6: a repeated Europe/Madrid wall time keeps the first occurrence', () => {
    expect(
      instantFromWall(
        { year: 2026, month: 10, day: 25, hour: 2, minute: 30, second: 0 },
        'Europe/Madrid',
      ),
    ).toBe('2026-10-25T00:30:00.000Z');
  });

  it('keeps a normal civil time and rejects a day that does not exist', () => {
    expect(
      instantFromWall(
        { year: 2026, month: 10, day: 20, hour: 16, minute: 0, second: 0 },
        'Europe/Madrid',
      ),
    ).toBe('2026-10-20T14:00:00.000Z');
    expect(
      instantFromWall(
        { year: 2026, month: 2, day: 31, hour: 9, minute: 0, second: 0 },
        'Europe/Madrid',
      ),
    ).toBeNull();
  });
});
