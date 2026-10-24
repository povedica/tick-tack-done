import { expect, it } from 'vitest';
import { anchorFix } from './anchor-fix';
it('TTD-AUD-134 RF-601/604: all-day correction moves start by the same calendar days', () => {
  expect(
    anchorFix(
      {
        due_date: '2026-11-02T23:00:00Z',
        start_date: '2026-11-01T23:00:00Z',
        time_zone: 'Europe/Madrid',
        is_all_day: true,
      },
      '2026-11-09',
    ),
  ).toEqual({ due_date: '2026-11-08T23:00:00.000Z', start_date: '2026-11-07T23:00:00.000Z' });
});
it('TTD-AUD-134 RF-706: timed correction preserves local time over DST', () => {
  expect(
    anchorFix(
      {
        due_date: '2026-10-25T00:30:45.123Z',
        start_date: '2026-10-24T08:00:00Z',
        time_zone: 'Europe/Madrid',
        is_all_day: false,
      },
      '2026-11-01',
    ),
  ).toEqual({ due_date: '2026-11-01T01:30:45.123Z', start_date: '2026-10-31T09:00:00.000Z' });
});
