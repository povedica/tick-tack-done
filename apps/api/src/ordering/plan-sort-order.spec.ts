import { SORT_ORDER_GAP } from '@reflexionia/domain';
import { describe, expect, it } from 'vitest';
import { planPlacement } from './plan-sort-order';

describe('planPlacement', () => {
  it('appends one gap after the last sibling', () => {
    const plan = planPlacement([{ id: 'a', sortOrder: SORT_ORDER_GAP }], null, { end: true });
    expect(plan.movingSortOrder).toBe(SORT_ORDER_GAP * 2n);
    expect(plan.updates).toEqual([]);
  });

  it('inserts before a neighbor without rewriting the list', () => {
    const plan = planPlacement(
      [
        { id: 'a', sortOrder: SORT_ORDER_GAP },
        { id: 'b', sortOrder: SORT_ORDER_GAP * 2n },
      ],
      null,
      { beforeId: 'b' },
    );
    expect(plan.movingSortOrder).toBe(SORT_ORDER_GAP + SORT_ORDER_GAP / 2n);
    expect(plan.updates).toEqual([]);
  });

  it('puts an item first when before_id is null', () => {
    const plan = planPlacement([{ id: 'a', sortOrder: SORT_ORDER_GAP }], null, { beforeId: null });
    expect(plan.movingSortOrder).toBe(SORT_ORDER_GAP / 2n);
  });

  it('rewrites siblings when two orders are adjacent', () => {
    const plan = planPlacement(
      [
        { id: 'a', sortOrder: 1n },
        { id: 'b', sortOrder: 2n },
      ],
      null,
      { beforeId: 'b' },
    );
    expect(plan.updates.map((row) => row.id)).toEqual(['a', 'b']);
    expect(plan.movingSortOrder).toBe(SORT_ORDER_GAP * 2n);
  });

  it('rejects an unknown neighbor', () => {
    expect(() => planPlacement([], null, { beforeId: 'missing' })).toThrow(/missing_neighbor/);
  });
});
