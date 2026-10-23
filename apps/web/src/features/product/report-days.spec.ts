import { expect, it } from 'vitest';
import { reportDays } from './report-days';

it('TTD-AUD-95: current report uses live daily aggregates only through today; closed reports keep saved values', () => {
  const saved = Array.from({ length: 7 }, (_, i) => ({
    date: `2026-10-${19 + i}`,
    completed: 9,
    created: 1,
  }));
  const live = [
    { date: '2026-10-19', completed: 2, created: 3 },
    { date: '2026-10-22', completed: 4, created: 5 },
    { date: '2026-10-23', completed: 99, created: 99 },
  ];
  const result = reportDays(saved, live, true, '2026-10-19', '2026-10-22');
  expect(result).toHaveLength(7);
  expect(result.reduce((sum, day) => sum + day.completed, 0)).toBe(6);
  expect(result[4]).toEqual({ date: '2026-10-23', completed: 0, created: 0 });
  expect(reportDays(saved, live, false, '2026-10-19', '2026-10-26')).toEqual(saved);
  expect(reportDays([], undefined, true, '2026-10-19', '2026-10-22')).toEqual([]);
});
