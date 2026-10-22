import { describe, it, expect } from 'vitest';
import {
  calendarDragPatch,
  calendarRepeatedHour,
  calendarAxisMinute,
  calendarAxisTarget,
} from './drag';
const task = {
  start_date: '2026-10-20T08:00:00.000Z',
  due_date: '2026-10-20T09:00:00.000Z',
  is_all_day: false,
  duration_minutes: 60,
};
const zone = 'Europe/Madrid';
describe('RF-1102 calendar rescheduling', () => {
  it('renders both repeated hours and maps the second back to CET', () => {
    expect(calendarRepeatedHour('2026-10-25', zone)).toBe(2);
    expect(calendarRepeatedHour('2026-03-29', zone)).toBeNull();
    expect(calendarAxisMinute('2026-10-25T00:30:00Z', zone, 2)).toBe(150);
    expect(calendarAxisMinute('2026-10-25T01:30:00Z', zone, 2)).toBe(210);
    expect(
      calendarDragPatch(task, calendarAxisTarget('2026-10-25', 210, 2, zone), zone).start_date,
    ).toBe('2026-10-25T01:30:00.000Z');
  });
  it('moves to a different day with elapsed duration and chooses the first repeated wall hour', () => {
    expect(calendarDragPatch(task, { day: '2026-10-25', minute: 150 }, zone)).toMatchObject({
      start_date: '2026-10-25T00:30:00.000Z',
      due_date: '2026-10-25T01:30:00.000Z',
      duration_minutes: 60,
    });
  });
  it('ignores a stale repeated-hour choice on an ordinary day or all-day conversion', () => {
    expect(
      calendarDragPatch(task, { day: '2026-10-26', minute: 150, laterOccurrence: true }, zone)
        .start_date,
    ).toBe('2026-10-26T01:30:00.000Z');
    expect(
      calendarDragPatch(task, { day: '2026-10-25', allDay: true, laterOccurrence: true }, zone)
        .due_date,
    ).toBe('2026-10-24T22:00:00.000Z');
  });
  it('preserves clock and duration on a month-cell drop', () => {
    expect(calendarDragPatch(task, { day: '2026-10-26', preserveClock: true }, zone)).toMatchObject(
      { start_date: '2026-10-26T09:00:00.000Z', due_date: '2026-10-26T10:00:00.000Z' },
    );
  });
  it('converts both ways without stale start or duration', () => {
    const allDay = calendarDragPatch(task, { day: '2026-10-25', allDay: true }, zone);
    expect(allDay).toMatchObject({
      due_date: '2026-10-24T22:00:00.000Z',
      start_date: null,
      duration_minutes: null,
      is_all_day: true,
    });
    expect(calendarDragPatch(allDay, { day: '2026-10-26', minute: 600 }, zone)).toMatchObject({
      duration_minutes: 60,
      is_all_day: false,
    });
  });
  it('limits resize to local midnight including short and long days', () => {
    const late = { ...task, start_date: '2026-10-20T21:30:00.000Z' };
    expect(
      calendarDragPatch(late, { day: '2026-10-20', minute: 1410, duration: 120 }, zone),
    ).toMatchObject({ duration_minutes: 30, due_date: '2026-10-20T22:00:00.000Z' });
  });
});
