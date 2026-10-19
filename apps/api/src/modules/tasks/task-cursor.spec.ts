import { describe, expect, it } from 'vitest';
import { encodeTaskCursor, parseTaskSort, taskKeyset } from './task-cursor.js';

describe('task cursors', () => {
  it('RF-502: priority order continues after the cursor priority', () => {
    const cursor = encodeTaskCursor('priority', {
      id: 'b',
      sortOrder: 10n,
      priority: 'high',
      dueDate: null,
    });
    expect(taskKeyset('priority', cursor)).toEqual({
      OR: [
        { priority: { in: ['medium', 'low', 'none'] } },
        { priority: 'high', sortOrder: { gt: 10n } },
        { priority: 'high', sortOrder: 10n, id: { gt: 'b' } },
      ],
    });
  });

  it('pages manual order by sort_order then id', () => {
    const cursor = encodeTaskCursor('manual', {
      id: 'a',
      sortOrder: 5n,
      priority: 'none',
      dueDate: null,
    });
    expect(taskKeyset('manual', cursor)).toEqual({
      OR: [{ sortOrder: { gt: 5n } }, { sortOrder: 5n, id: { gt: 'a' } }],
    });
  });

  it('puts dated tasks ahead of tasks without a due date', () => {
    const cursor = encodeTaskCursor('due', {
      id: 'a',
      sortOrder: 1n,
      priority: 'none',
      dueDate: new Date('2026-10-17T00:00:00.000Z'),
    });
    const keyset = taskKeyset('due', cursor);
    expect(keyset?.OR).toEqual(expect.arrayContaining([{ dueDate: null }]));
  });

  it('rejects an unknown sort', () => {
    expect(parseTaskSort(undefined)).toBe('manual');
    expect(() => parseTaskSort('title')).toThrow(/sort/);
  });
});
