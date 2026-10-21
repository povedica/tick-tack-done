import { describe, expect, it } from 'vitest';
import { formatTaskRowDate } from './row-date';

const now = new Date('2026-10-21T12:00:00.000Z');
const labels = { dateToday: 'Hoy', dateTomorrow: 'Mañana' };
const task = {
  startDate: '2026-10-22T07:00:00.000Z',
  dueDate: null,
  isAllDay: false,
  durationMinutes: null,
  timeZone: 'Europe/Madrid',
};

describe('TTD-AUD-01 row schedule', () => {
  it('RF-601 RF-604: shows start, fallback deadline and all-day date in the task zone', () => {
    expect(formatTaskRowDate(task, 'es', now, labels)).toBe('Mañana 09:00');
    expect(
      formatTaskRowDate({ ...task, startDate: null, dueDate: task.startDate }, 'es', now, labels),
    ).toBe('Mañana 09:00');
    expect(formatTaskRowDate({ ...task, isAllDay: true }, 'es', now, labels)).toBe('Mañana');
    expect(
      formatTaskRowDate({ ...task, startDate: '2026-10-21T22:00:00.000Z' }, 'es', now, labels),
    ).toBe('Mañana 00:00');
    expect(formatTaskRowDate({ ...task, startDate: null }, 'es', now, labels)).toBe('');
  });
  it('RF-602: shows duration and explicit end ranges including the start date', () => {
    expect(formatTaskRowDate({ ...task, durationMinutes: 30 }, 'es', now, labels)).toBe(
      'Mañana 09:00–09:30',
    );
    expect(
      formatTaskRowDate({ ...task, dueDate: '2026-10-22T07:30:00.000Z' }, 'es', now, labels),
    ).toBe('Mañana 09:00–09:30');
    expect(
      formatTaskRowDate({ ...task, durationMinutes: 30, isAllDay: true }, 'es', now, labels),
    ).toBe('Mañana');
  });
});
