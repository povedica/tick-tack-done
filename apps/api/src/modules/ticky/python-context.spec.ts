import { buildContextSnapshot } from '@reflexionia/domain';
import { describe, expect, it } from 'vitest';
import { pythonContext } from './python-context.js';

const input = {
  authorityVersion: 3,
  sourceRevision: 7,
  issuedAt: '2026-10-20T10:00:00Z',
  timeZone: 'Europe/Madrid',
  workday: { start: '09:00', end: '17:00' },
  calendar: { busy: [{ start: '2026-10-20T11:00:00Z', end: '2026-10-20T12:00:00Z' }] },
  review: null,
  taskEnergy: [],
  durationObservations: [],
} as const;

describe('APP-05: canonical context adapter', () => {
  it('converts explicit civil work hours to instants in the approved timezone', () => {
    const context = pythonContext(buildContextSnapshot(input));
    expect(context).toMatchObject({
      version: 1,
      authority_version: 3,
      source_revision: 7,
      timezone: 'Europe/Madrid',
      calendar: {
        work: { start: '2026-10-20T07:00:00.000Z', end: '2026-10-20T15:00:00.000Z' },
        busy: input.calendar.busy,
      },
    });
    expect(context).not.toHaveProperty('workday');
    expect(context).not.toHaveProperty('time_zone');
  });

  it.each([
    { workday: null },
    { calendar: null },
    { workday: { start: '17:00', end: '09:00' } },
    { workday: { start: 'invalid', end: '17:00' } },
  ])('keeps incomplete or invalid calendar capacity unknown: %s', (patch) => {
    expect(pythonContext(buildContextSnapshot({ ...input, ...patch })).calendar).toBeNull();
  });
});
