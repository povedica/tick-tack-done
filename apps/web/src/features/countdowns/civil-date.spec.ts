import { expect, it } from 'vitest';
import { formatCountdownDay, parseCountdownDay } from './civil-date';

it('TTD-AUD-23: formats and parses ES/EN civil dates without a browser time zone', () => {
  expect(formatCountdownDay('2026-11-23', 'es')).toBe('23/11/2026');
  expect(formatCountdownDay('2026-11-23', 'en')).toBe('11/23/2026');
  expect(parseCountdownDay('23/11/2026', 'es')).toBe('2026-11-23');
  expect(parseCountdownDay('11/23/2026', 'en')).toBe('2026-11-23');
  expect(parseCountdownDay('29/02/2028', 'es')).toBe('2028-02-29');
});

it.each(['31/02/2027', '29/02/2027', '31/04/2027', '00/01/2027', '1/13/2027', '23/11/0000'])(
  'TTD-AUD-23: rejects impossible civil date %s',
  (value) => {
    expect(parseCountdownDay(value, 'es')).toBeNull();
  },
);
