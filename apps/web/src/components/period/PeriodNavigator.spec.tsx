import { expect, it } from 'vitest';
import { formatMonthYear, formatPeriodDate } from './period-date';
it.each([
  ['es-ES', '28/10/2026'],
  ['en-GB', '28/10/2026'],
  ['en-US', '10/28/2026'],
])('RF-1101 TTD-AUD-133: period format %s', (locale, expected) => {
  expect(formatPeriodDate(new Date(2026, 9, 28), locale)).toBe(expected);
});

it.each(['es', 'es-ES'])('formatMonthYear short %s is nov 2026 on one line', (locale) => {
  const label = formatMonthYear(new Date(2026, 10, 12), locale, 'short');
  expect(label).toBe('nov 2026');
  expect(label.includes('de')).toBe(false);
  expect(label.includes('\n')).toBe(false);
});

it('formatMonthYear long es-ES keeps the full month', () => {
  expect(formatMonthYear(new Date(2026, 10, 12), 'es-ES', 'long')).toBe('noviembre de 2026');
});
