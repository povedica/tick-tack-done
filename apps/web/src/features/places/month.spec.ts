import { describe, expect, it } from 'vitest';
import {
  dayFromParam,
  isCalendarOverdue,
  localDateParam,
  overflowHref,
  tasksOnCell,
  type DatedTask,
} from './month';

describe('month cells', () => {
  it('links +N to the local day and the day view lists every task on that cell', () => {
    const day = new Date(2026, 9, 18);
    const tasks: DatedTask[] = Array.from({ length: 5 }, (_, index) => ({
      id: String(index),
      title: `Tarea ${String(index)}`,
      due_date: '2026-10-18T10:00:00.000Z',
      project_id: 'list',
      time_zone: 'UTC',
    }));
    const visible = tasks.slice(0, 3);
    const href = overflowHref(day);
    expect(visible).toHaveLength(3);
    expect(href).toBe(`/calendar/day?date=${localDateParam(day)}`);
    expect(localDateParam(day)).toBe('2026-10-18');
    const opened = dayFromParam('2026-10-18');
    expect(opened).not.toBeNull();
    if (opened === null) {
      return;
    }
    expect(tasksOnCell(tasks, opened, 'UTC')).toHaveLength(5);
  });

  it('keeps a 10:00 Madrid task on the 20th, not the 21st', () => {
    const tasks: DatedTask[] = [
      {
        id: 'timed',
        title: 'hora',
        due_date: '2026-10-20T08:00:00.000Z',
        project_id: 'list',
        time_zone: 'Europe/Madrid',
      },
      {
        id: 'all-day',
        title: 'dia',
        due_date: '2026-10-19T22:00:00.000Z',
        project_id: 'list',
        time_zone: 'Europe/Madrid',
        is_all_day: true,
      },
    ];
    expect(
      tasksOnCell(tasks, new Date(2026, 9, 20), 'Europe/Madrid').map((task) => task.id),
    ).toEqual(['timed', 'all-day']);
    expect(tasksOnCell(tasks, new Date(2026, 9, 21), 'Europe/Madrid')).toHaveLength(0);
    expect(
      isCalendarOverdue('2026-10-20T08:00:00.000Z', 'Europe/Madrid', new Date(2026, 9, 20, 12)),
    ).toBe(false);
    expect(
      isCalendarOverdue('2026-10-19T08:00:00.000Z', 'Europe/Madrid', new Date(2026, 9, 20, 12)),
    ).toBe(true);
  });
});
