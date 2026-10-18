import { describe, expect, it } from 'vitest';
import type { ListTasksQuery, Task, TaskPage } from '@reflexionia/sdk';
import { loadTodayTasks, type TaskReader } from './board';

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
    is_all_day: false,
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

function reader(pages: (query: ListTasksQuery | undefined) => TaskPage): {
  client: TaskReader;
  calls: ListTasksQuery[];
} {
  const calls: ListTasksQuery[] = [];
  return {
    calls,
    client: {
      listTasks: (query) => {
        calls.push(query ?? {});
        return Promise.resolve(pages(query));
      },
    },
  };
}

describe('today board', () => {
  it('UI-401: reads overdue tasks and the surrounding due window, skipping notes', async () => {
    const { client, calls } = reader((query) => {
      if (query?.overdue === true && query.cursor === undefined) {
        return {
          items: [
            row({ id: 'old', title: 'Informe', due_date: '2026-10-15T10:00:00.000Z' }),
            row({
              id: 'note',
              title: 'Apunte',
              due_date: '2026-10-15T10:00:00.000Z',
              kind: 'note',
            }),
          ],
          next_cursor: 'next',
        };
      }
      if (query?.cursor === 'next') {
        return {
          items: [row({ id: 'older', title: 'Antes', due_date: '2026-10-14T10:00:00.000Z' })],
          next_cursor: null,
        };
      }
      return {
        items: [
          row({ id: 'old', title: 'Informe', due_date: '2026-10-15T10:00:00.000Z' }),
          row({
            id: 'today',
            title: 'Leche',
            due_date: '2026-10-17T18:00:00.000Z',
            priority: 'high',
          }),
          row({ id: 'later', title: 'Luego', due_date: '2026-10-20T18:00:00.000Z' }),
        ],
        next_cursor: null,
      };
    });

    const tasks = await loadTodayTasks(client, now);

    expect(tasks.map((task) => task.id)).toEqual(['older', 'old', 'today']);
    expect(calls[0]).toMatchObject({ status: 'active', overdue: true, sort: 'due', limit: 100 });
    expect(calls.some((query) => query.cursor === 'next')).toBe(true);
    const window = calls.find((query) => query.dueAfter !== undefined);
    expect(window?.dueBefore).toBe('2026-10-19T12:00:00.000Z');
    expect(window?.dueAfter).toBe('2026-10-15T12:00:00.000Z');
  });
});
