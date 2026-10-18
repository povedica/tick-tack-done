import { describe, expect, it } from 'vitest';
import {
  cellKey,
  dayFromParam,
  localDateParam,
  overflowHref,
  tasksOnCell,
  type DatedTask,
} from './month';

describe('month cells', () => {
  it('links +N to the local day and the day view lists every task on that cell', () => {
    const day = new Date(2026, 9, 18);
    const key = cellKey(day);
    const tasks: DatedTask[] = Array.from({ length: 5 }, (_, index) => ({
      id: String(index),
      title: `Tarea ${String(index)}`,
      due_date: `${key}T12:00:00.000Z`,
      project_id: 'list',
    }));
    const visible = tasks.slice(0, 3);
    const href = overflowHref(day);
    expect(visible).toHaveLength(3);
    expect(href).toBe(`/calendar/day?date=${localDateParam(day)}`);
    expect(localDateParam(day)).toBe('2026-10-18');
    const utcKey = day.toISOString().slice(0, 10);
    expect(href.includes(`date=${utcKey}`)).toBe(utcKey === '2026-10-18');
    const opened = dayFromParam('2026-10-18');
    expect(opened).not.toBeNull();
    if (opened === null) {
      return;
    }
    expect(tasksOnCell(tasks, opened)).toHaveLength(5);
  });
});
