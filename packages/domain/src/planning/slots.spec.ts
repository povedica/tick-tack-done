import { expect, it } from 'vitest';
import { freeSlots, snap15 } from './slots';
it('RF-604 / F-AC-9: excludes overlaps, snaps to fifteen minutes and respects workday and evening', () => {
  const slots = freeSlots({
    date: '2026-10-26',
    timeZone: 'Europe/Madrid',
    duration: 30,
    workDayStart: '09:00',
    workDayEnd: '18:00',
    eveningStart: '17:00',
    busy: [{ id: 'daily', start: '2026-10-26T08:00:00Z', end: '2026-10-26T08:30:00Z' }],
  });
  expect(slots[0]).toBe('09:30');
  expect(slots).not.toContain('09:15');
  expect(slots.at(-1)).toBe('16:30');
  expect(snap15(577)).toBe(570);
});
it('F-AC-9: unavailable workday and fully occupied windows have no slots', () => {
  expect(
    freeSlots({
      date: '2026-10-26',
      timeZone: 'UTC',
      duration: 30,
      workDayStart: null,
      workDayEnd: null,
      busy: [],
    }),
  ).toEqual([]);
  expect(
    freeSlots({
      date: '2026-10-26',
      timeZone: 'UTC',
      duration: 30,
      workDayStart: '09:00',
      workDayEnd: '10:00',
      busy: [{ id: 'full', start: '2026-10-26T09:00Z', end: '2026-10-26T10:00Z' }],
    }),
  ).toEqual([]);
});
