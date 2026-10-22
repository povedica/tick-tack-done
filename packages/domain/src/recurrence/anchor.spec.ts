import { describe, expect, it } from 'vitest';
import { recurrenceAnchorWarning } from './anchor';
describe('TTD-AUD-81 / RF-701 recurrence anchor', () => {
  const input = {
    repeatRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
    dueDate: '2026-10-19T22:00:00.000Z',
    timeZone: 'Europe/Madrid',
  };
  it('warns on a Tuesday anchor and finds the next Monday across DST', () => {
    expect(recurrenceAnchorWarning(input)).toEqual({
      code: 'anchor_outside_rule',
      next_matching: '2026-10-26',
    });
  });
  it('accepts a matching Monday and ignores absent or invalid recurrence', () => {
    expect(recurrenceAnchorWarning({ ...input, dueDate: '2026-10-18T22:00:00.000Z' })).toBeNull();
    expect(recurrenceAnchorWarning({ ...input, repeatRule: null })).toBeNull();
    expect(recurrenceAnchorWarning({ ...input, repeatRule: 'invalid' })).toBeNull();
    expect(recurrenceAnchorWarning({ ...input, dueDate: null })).toBeNull();
  });
});
