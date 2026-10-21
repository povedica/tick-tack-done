import { describe, expect, it } from 'vitest';
import type { SmartListPage, ViewPage } from '@reflexionia/sdk';
import { decrementTrashCount, removeTaskFromView } from './purge-trash';

describe('purge trash cache helpers (TTD-AUD-16)', () => {
  it('removes the task from every group', () => {
    const page = {
      group_by: 'none',
      sort: 'manual',
      groups: [
        {
          key: 'all',
          label: 'All',
          tasks: [
            { id: 'a', title: 'Keep' },
            { id: 'b', title: 'Purge' },
          ],
        },
      ],
    } as unknown as ViewPage;
    const next = removeTaskFromView(page, 'b');
    expect(next.groups[0]?.tasks.map((task) => task.id)).toEqual(['a']);
  });

  it('decrements the trash badge without going negative', () => {
    const page = {
      items: [
        { key: 'today', task_count: 3 },
        { key: 'trash', task_count: 1 },
      ],
    } as unknown as SmartListPage;
    expect(decrementTrashCount(page).items.find((item) => item.key === 'trash')?.task_count).toBe(
      0,
    );
    expect(
      decrementTrashCount({
        items: [{ key: 'trash', task_count: 0 }],
      } as unknown as SmartListPage).items[0]?.task_count,
    ).toBe(0);
  });
});
