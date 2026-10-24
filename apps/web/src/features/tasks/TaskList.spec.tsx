// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { withLinkCounts, loadVisibleLinkCounts } from './TaskList';
import type { ListTasksQuery } from '@reflexionia/sdk';
import { rowFromView } from './model';
import type { ViewPage } from '@reflexionia/sdk';
vi.mock('./TaskComposer', () => ({ TaskComposer: () => null }));

it('RF-1001 TTD-AUD-128: enriches rows with 0/1/2 links without losing row data', () => {
  const raw = [undefined, 1, 2].map(
    (link_count, index) =>
      ({
        id: String(index),
        title: 'Tarea',
        priority: 'none',
        due_date: null,
        start_date: null,
        duration_minutes: null,
        is_all_day: true,
        time_zone: 'Europe/Madrid',
        project_id: 'list',
        project_name: 'Lista',
        column_id: null,
        kind: 'task',
        status: 'active',
        checklist_progress: null,
        ...(link_count === undefined ? {} : { link_count }),
      }) as unknown as ViewPage['groups'][number]['tasks'][number],
  );
  const rows = raw.map(rowFromView);
  expect(withLinkCounts(rows, raw).map((row) => row.linkCount)).toEqual([0, 1, 2]);
  expect(withLinkCounts(rows, raw)).toEqual(
    rows.map((row, index) => ({ ...row, linkCount: index })),
  );
  expect(rows.some((row) => 'linkCount' in row)).toBe(false);
});

it('TTD-AUD-128: explicitly reads completed and cancelled counts instead of the default active scope', async () => {
  const list = vi.fn((query: ListTasksQuery) =>
    Promise.resolve({
      items:
        query.status === 'completed'
          ? [{ id: 'done', link_count: 2 }]
          : query.status === 'cancelled'
            ? [{ id: 'cancelled', link_count: 1 }]
            : [],
      next_cursor: null,
    }),
  );
  expect(await loadVisibleLinkCounts(list, 'project', ['done'])).toEqual([]);
  expect(await loadVisibleLinkCounts(list, 'project', ['done'], undefined, 'completed')).toEqual([
    { id: 'done', link_count: 2 },
  ]);
  expect(
    await loadVisibleLinkCounts(list, 'project', ['cancelled'], undefined, 'cancelled'),
  ).toEqual([{ id: 'cancelled', link_count: 1 }]);
  expect(list.mock.calls.map(([query]) => query.status)).toEqual([
    'active',
    'completed',
    'cancelled',
  ]);
});

it('TTD-AUD-128: refreshes a visible second-page count with an unchanged cursor and stops at that page', async () => {
  let count = 2;
  const list = vi.fn((query: ListTasksQuery) =>
    Promise.resolve(
      query.cursor === undefined
        ? { items: [{ id: 'other', link_count: 0 }], next_cursor: 'second' }
        : { items: [{ id: 'visible', link_count: count }], next_cursor: 'unneeded-third' },
    ),
  );
  expect(await loadVisibleLinkCounts(list, 'project', ['visible'])).toEqual([
    { id: 'visible', link_count: 2 },
  ]);
  count = 3;
  expect(await loadVisibleLinkCounts(list, 'project', ['visible'])).toEqual([
    { id: 'visible', link_count: 3 },
  ]);
  expect(list.mock.calls.map(([query]) => query.cursor)).toEqual([
    undefined,
    'second',
    undefined,
    'second',
  ]);
});
