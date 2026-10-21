import { describe, expect, it } from 'vitest';
import { gardenProjectContext, type GardenProjectInput } from './projects';
const now = '2026-10-20T12:00:00Z';
const base: GardenProjectInput = {
  id: 'one',
  name: 'Project',
  createdAt: '2026-08-01T12:00:00Z',
  deletedAt: null,
  closed: false,
  isNote: false,
  activeTasks: 3,
  created7d: 0,
  completed7d: 0,
  lastTaskActivity: '2026-08-02T12:00:00Z',
};
describe('garden project context', () => {
  it('flags stale task projects and old projects without pending work, with explicit states', () => {
    const result = gardenProjectContext([base, { ...base, id: 'empty', activeTasks: 0 }], now);
    expect(result.needs_review).toBe(2);
    expect(result.items.map((item) => item.state)).toEqual(['stale', 'no_pending']);
  });
  it('does not suggest closing notes, new or already closed projects', () => {
    const result = gardenProjectContext(
      [
        { ...base, isNote: true },
        { ...base, id: 'new', createdAt: '2026-10-19T12:00:00Z', activeTasks: 0 },
        { ...base, id: 'closed', closed: true },
      ],
      now,
    );
    expect(result.needs_review).toBe(0);
    expect(result.created_7d).toBe(1);
    expect(result.items.map((item) => item.state)).toEqual(['notes', 'new', 'closed']);
  });
  it('recognizes recent deletions and keeps recent task activity distinct from creation', () => {
    const result = gardenProjectContext(
      [
        { ...base, deletedAt: '2026-10-19T12:00:00Z' },
        {
          ...base,
          id: 'active',
          lastTaskActivity: '2026-10-19T12:00:00Z',
          created7d: 5,
          completed7d: 2,
        },
      ],
      now,
    );
    expect(result.deleted_7d).toBe(1);
    expect(result.open).toBe(1);
    expect(result.items[1]).toMatchObject({
      state: 'active',
      created_7d: 5,
      completed_7d: 2,
      needs_review: false,
    });
  });
});
