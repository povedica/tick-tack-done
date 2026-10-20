import { describe, expect, it } from 'vitest';
import type { ListTasksQuery, Task, TaskPage } from '@reflexionia/sdk';
import { loadMatrixTasks, tasksForMatrixScope } from './load';
import type { MatrixScope } from './scope';

const now = new Date('2026-10-17T12:00:00.000Z');

function row(partial: Pick<Task, 'id' | 'title' | 'due_date'> & Partial<Task>): Task {
  return {
    project_id: 'inbox',
    parent_id: null,
    column_id: null,
    content: '',
    kind: 'task',
    status: 'active',
    priority: 'none',
    is_all_day: true,
    start_date: null,
    time_zone: 'Europe/Madrid',
    duration_minutes: null,
    repeat_rule: null,
    repeat_from: 'due_date',
    series_id: null,
    sort_order: '1',
    tag_ids: [],
    assignee_id: null,
    created_by: 'user',
    completed_at: null,
    source: 'manual',
    checklist_progress: { completed: 0, total: 0 },
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    deleted_at: null,
    ...partial,
  };
}

describe('tasksForMatrixScope', () => {
  const tasks = [
    row({ id: 'task', title: 'Tarea', due_date: '2026-10-17' }),
    row({ id: 'note', title: 'Nota', due_date: '2026-10-17', kind: 'note' }),
    row({ id: 'child', title: 'Subtarea', due_date: '2026-10-17', parent_id: 'task' }),
    row({ id: 'later', title: 'Luego', due_date: '2026-10-20' }),
    row({ id: 'late', title: 'Vencida', due_date: '2026-10-01' }),
  ];

  it('drops notes and subtasks in the global scope', () => {
    const scope: MatrixScope = { kind: 'all' };
    expect(tasksForMatrixScope(tasks, scope, now).map((task) => task.id)).toEqual([
      'task',
      'later',
      'late',
    ]);
  });

  it('keeps overdue tasks and tasks due today', () => {
    const scope: MatrixScope = { kind: 'today' };
    expect(tasksForMatrixScope(tasks, scope, now).map((task) => task.id)).toEqual(['task', 'late']);
  });
});

describe('loadMatrixTasks', () => {
  it('pages past the first hundred active tasks and asks the server for the list', async () => {
    const calls: ListTasksQuery[] = [];
    const page = (query: ListTasksQuery | undefined): TaskPage => {
      calls.push(query ?? {});
      if (query?.listId === 'list-1') {
        return { items: [row({ id: 'only', title: 'Una', due_date: null })], next_cursor: null };
      }
      const cursor = query?.cursor;
      if (cursor === undefined) {
        return {
          items: Array.from({ length: 100 }, (_, index) =>
            row({ id: `t-${index}`, title: `T${index}`, due_date: null }),
          ),
          next_cursor: 'page-2',
        };
      }
      return {
        items: [row({ id: 't-100', title: 'T100', due_date: null })],
        next_cursor: null,
      };
    };
    const all = await loadMatrixTasks(
      (query) => Promise.resolve(page(query)),
      { kind: 'all' },
      now,
    );
    expect(all).toHaveLength(101);
    expect(calls.some((query) => query.limit === 100 && query.cursor === 'page-2')).toBe(true);

    calls.length = 0;
    const listed = await loadMatrixTasks(
      (query) => Promise.resolve(page(query)),
      { kind: 'list', listId: 'list-1' },
      now,
    );
    expect(listed.map((task) => task.id)).toEqual(['only']);
    expect(calls[0]?.listId).toBe('list-1');
  });
});
