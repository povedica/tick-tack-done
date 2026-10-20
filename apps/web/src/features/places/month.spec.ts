import { describe, expect, it } from 'vitest';
import { calendarTaskLabel, isoWeek, quarterMonths, shiftView, viewDays } from './month';

describe('calendar view windows', () => {
  const monday = new Date(2026, 9, 19);
  it('CAL-1 and AG-1: ISO weeks cross the year correctly and agenda loads sixty forward days', () => {
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53);
    expect(isoWeek(new Date(2027, 0, 4))).toBe(1);
    const agenda = viewDays('agenda', monday, 'monday');
    expect(agenda).toHaveLength(60);
    expect(agenda[0]).toEqual(monday);
  });

  it('week is seven days starting Monday', () => {
    const days = viewDays('week', monday, 'monday');
    expect(days).toHaveLength(7);
    expect(days[0]?.getDate()).toBe(19);
    expect(days[6]?.getDate()).toBe(25);
  });

  it('multi-day is three days and multi-week is fourteen', () => {
    expect(viewDays('multi-day', monday, 'monday')).toHaveLength(3);
    expect(viewDays('multi-week', monday, 'monday')).toHaveLength(14);
  });

  it('quarter is October–December and the next step is January', () => {
    const months = quarterMonths(monday);
    expect(months.map((month) => month.getMonth())).toEqual([9, 10, 11]);
    expect(viewDays('quarter', monday, 'monday')).toHaveLength(42 * 3);
    const next = shiftView(monday, 'quarter', 1, 'monday');
    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(0);
  });

  it('drops a leading 29/10 when the task already sits on that day', () => {
    const due = '2026-10-29T10:00:00.000Z';
    expect(calendarTaskLabel('29/10 Cumple de Alberto', due, 'Europe/Madrid', 'Sin título')).toBe(
      'Cumple de Alberto',
    );
    expect(calendarTaskLabel('29/10/2026 - Cumple', due, 'Europe/Madrid', 'Sin título')).toBe(
      'Cumple',
    );
    expect(calendarTaskLabel('30/10 Otra cosa', due, 'Europe/Madrid', 'Sin título')).toBe(
      '30/10 Otra cosa',
    );
    expect(calendarTaskLabel('29/10', due, 'Europe/Madrid', 'Sin título')).toBe('Sin título');
  });

  it('year shift keeps the month and moves the year', () => {
    const next = shiftView(monday, 'year', 1, 'monday');
    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(9);
  });
});
