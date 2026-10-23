import { describe, expect, it } from 'vitest';
import { repairAllDayUtc } from './repair-allday';
describe('TTD-AUD-85.6 all-day UTC repair', () => {
  it('preserves the civil day in Madrid and handles daylight saving time', () => {
    expect(repairAllDayUtc('2026-10-21T00:00:00.000Z', 'Europe/Madrid')).toBe(
      '2026-10-20T22:00:00.000Z',
    );
    expect(repairAllDayUtc('2026-12-21T00:00:00.000Z', 'Europe/Madrid')).toBe(
      '2026-12-20T23:00:00.000Z',
    );
  });
  it('is idempotent, leaves other instants alone, and rejects invalid zones', () => {
    expect(repairAllDayUtc('2026-10-20T22:00:00.000Z', 'Europe/Madrid')).toBeNull();
    expect(repairAllDayUtc('2026-10-21T00:00:00.000Z', 'UTC')).toBeNull();
    expect(repairAllDayUtc('2026-10-21T00:00:00.000Z', 'bogus')).toBeNull();
  });
});
