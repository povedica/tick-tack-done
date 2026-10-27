import type { ViewPage } from '@reflexionia/sdk';
import { describe, expect, it } from 'vitest';
import {
  isOverdue,
  quadrantOf,
  rowFromView,
  rowsFromView,
  smartApiKey,
  type RowModel,
} from './model';

const row = {
  priority: 'high',
  dueDate: '2026-10-18T08:00:00.000Z',
} as Pick<RowModel, 'priority' | 'dueDate'>;

describe('task view helpers', () => {
  it('maps spec smart-list slugs onto the API keys', () => {
    expect(smartApiKey('next7')).toBe('next_7_days');
    expect(smartApiKey('no-date')).toBe('no_date');
    expect(smartApiKey('recent')).toBe('recently_added');
    expect(smartApiKey('all')).toBe('all');
  });

  it('a future start is not painted overdue', () => {
    const now = new Date('2026-10-27T11:00:00.000Z');
    expect(
      isOverdue('2026-10-24T22:00:00.000Z', now, '2026-10-28T23:00:00.000Z', 'Europe/Madrid'),
    ).toBe(false);
    expect(
      isOverdue('2026-10-24T22:00:00.000Z', now, '2026-10-26T23:00:00.000Z', 'Europe/Madrid'),
    ).toBe(true);
    expect(isOverdue('2026-10-24T22:00:00.000Z', now)).toBe(true);
  });

  it('UI-1101: overdue high priority lands in the urgent-important quadrant', () => {
    expect(quadrantOf(row.priority, row.dueDate, new Date('2026-10-18T12:00:00.000Z'))).toBe('do');
    expect(
      quadrantOf('low', '2026-10-30T12:00:00.000Z', new Date('2026-10-18T12:00:00.000Z')),
    ).toBe('drop');
  });

  it('does not crash when a smart-list task omits repeat_rule and tags', () => {
    const task = {
      id: '1',
      title: 'Mañana',
      priority: 'none',
      due_date: null,
      start_date: '2026-10-22T07:00:00.000Z',
      duration_minutes: 30,
      is_all_day: false,
      time_zone: 'Europe/Madrid',
      project_id: 'inbox',
      project_name: 'Bandeja',
      column_id: null,
      kind: 'task',
      status: 'active',
      checklist_progress: null,
    } as unknown as ViewPage['groups'][number]['tasks'][number];
    expect(rowFromView(task)).toMatchObject({
      startDate: task.start_date,
      durationMinutes: 30,
      isAllDay: false,
    });
    expect(rowFromView(task).repeat).toBe(false);
    expect(rowFromView(task).tags).toEqual([]);
    const page = { groups: [{ tasks: [task] }] } as ViewPage;
    expect(rowsFromView(page)).toHaveLength(1);
  });
});
