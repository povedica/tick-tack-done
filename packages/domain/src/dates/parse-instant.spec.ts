import { describe, expect, it } from 'vitest';
import { parseTaskInstant } from './parse-instant';

describe('parseTaskInstant (TTD-AUD-55)', () => {
  it('maps YYYY-MM-DD to local midnight in Europe/Madrid', () => {
    const parsed = parseTaskInstant('2026-10-22', 'Europe/Madrid');
    expect(parsed).toEqual({
      ok: true,
      iso: '2026-10-21T22:00:00.000Z',
      dateOnly: true,
    });
  });

  it('maps YYYY-MM-DD to midnight UTC in UTC', () => {
    expect(parseTaskInstant('2026-10-22', 'UTC')).toEqual({
      ok: true,
      iso: '2026-10-22T00:00:00.000Z',
      dateOnly: true,
    });
  });

  it('keeps absolute ISO instants as timed', () => {
    const parsed = parseTaskInstant('2026-10-22T09:00:00+02:00', 'Europe/Madrid');
    expect(parsed).toEqual({
      ok: true,
      iso: '2026-10-22T07:00:00.000Z',
      dateOnly: false,
    });
  });

  it('rejects invalid values', () => {
    expect(parseTaskInstant('not-a-date', 'Europe/Madrid')).toEqual({
      ok: false,
      reason: 'invalid_date',
    });
  });
});
