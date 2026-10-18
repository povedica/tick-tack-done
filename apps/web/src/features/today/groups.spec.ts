import { describe, expect, it } from 'vitest';
import {
  activeTasks,
  formatDueDate,
  groupFromLocation,
  groupTasks,
  isOverdue,
  parseGroup,
  partitionToday,
  visibleTasks,
  type TodayTask,
} from './groups';

const now = new Date('2026-10-17T12:00:00.000Z');

function task(partial: Partial<TodayTask> & Pick<TodayTask, 'id' | 'dueDate'>): TodayTask {
  return {
    title: partial.id,
    priority: 'none',
    timeZone: 'Europe/Madrid',
    status: 'active',
    projectId: 'inbox',
    tagIds: [],
    ...partial,
  };
}

describe('today groups', () => {
  it('UI-401: overdue tasks are the ones dated before today in their zone', () => {
    const overdue = task({ id: 'old', dueDate: '2026-10-16T10:00:00.000Z' });
    const today = task({ id: 'today', dueDate: '2026-10-17T18:00:00.000Z' });
    const undated = task({ id: 'none', dueDate: null });
    expect(isOverdue(overdue, now)).toBe(true);
    expect(isOverdue(today, now)).toBe(false);
    expect(isOverdue(undated, now)).toBe(false);
  });

  it('UI-402: priority is the default group and the query overrides the stored one', () => {
    expect(parseGroup(null)).toBe('priority');
    expect(groupFromLocation(null, 'due')).toBe('due');
    expect(groupFromLocation('tag', 'due')).toBe('tag');
    expect(groupFromLocation('nope', 'list')).toBe('priority');
    const grouped = groupTasks(
      [
        task({ id: 'a', dueDate: null, priority: 'low' }),
        task({ id: 'b', dueDate: null, priority: 'high' }),
        task({ id: 'c', dueDate: null, priority: 'high', status: 'completed' }),
      ],
      'priority',
    );
    expect(grouped.map((section) => section.id)).toEqual(['high', 'low']);
    expect(activeTasks(grouped.flatMap((section) => section.tasks)).map((item) => item.id)).toEqual(
      ['b', 'a'],
    );
  });

  it('UI-401: overdue tasks stay in their own group above today', () => {
    const parts = partitionToday(
      [
        task({ id: 'today', dueDate: '2026-10-17T18:00:00.000Z', priority: 'low' }),
        task({ id: 'old', dueDate: '2026-10-15T10:00:00.000Z', priority: 'high' }),
        task({ id: 'older', dueDate: '2026-10-14T10:00:00.000Z' }),
        task({ id: 'later', dueDate: '2026-10-20T10:00:00.000Z' }),
      ],
      now,
    );
    expect(parts.overdue.map((item) => item.id)).toEqual(['older', 'old']);
    expect(parts.today.map((item) => item.id)).toEqual(['today']);
  });

  it('UI-402: due, tag and list buckets follow the task and dates sort first', () => {
    const undated = task({ id: 'b', dueDate: null, tagIds: [], projectId: 'inbox' });
    const dated = task({
      id: 'a',
      dueDate: '2026-10-17T18:00:00.000Z',
      tagIds: ['casa'],
      projectId: 'trabajo',
    });
    expect(groupTasks([undated, dated], 'due').map((section) => section.id)).toEqual([
      '2026-10-17',
      'none',
    ]);
    expect(groupTasks([dated, undated], 'tag').map((section) => section.id)).toEqual([
      'casa',
      'none',
    ]);
    expect(groupTasks([dated, undated], 'list').map((section) => section.id)).toEqual([
      'trabajo',
      'inbox',
    ]);
  });

  it('UI-404: a completed task leaves the list and undo puts it back in place', () => {
    const tasks = [
      task({ id: 'a', dueDate: null }),
      task({ id: 'b', dueDate: null }),
      task({ id: 'c', dueDate: null }),
    ];
    expect(visibleTasks(tasks, new Set(['b'])).map((item) => item.id)).toEqual(['a', 'c']);
    expect(visibleTasks(tasks, new Set()).map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('UI-405: a task due today reads Hoy and an older day keeps the date', () => {
    const labels = { today: 'Hoy', tomorrow: 'Mañana' };
    expect(formatDueDate(new Date().toISOString(), 'Europe/Madrid', 'es', labels)).toBe('Hoy');
    expect(formatDueDate('2020-03-15T10:00:00.000Z', 'Europe/Madrid', 'es', labels)).toMatch(/15/);
  });
});
