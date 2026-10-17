import { describe, expect, it } from 'vitest';
import {
  activeTasks,
  groupFromLocation,
  groupTasks,
  isOverdue,
  parseGroup,
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
});
