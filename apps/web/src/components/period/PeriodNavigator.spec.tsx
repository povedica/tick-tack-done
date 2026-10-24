import { expect, it } from 'vitest';
import { formatPeriodDate } from './period-date';
it.each([
  ['es-ES', '28/10/2026'],
  ['en-GB', '28/10/2026'],
  ['en-US', '10/28/2026'],
])('RF-1101 TTD-AUD-133: period format %s', (locale, expected) =>
  expect(formatPeriodDate(new Date(2026, 9, 28), locale)).toBe(expected),
);
