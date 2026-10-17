import { describe, expect, it } from 'vitest';
import {
  rebalancedSortOrders,
  SORT_ORDER_GAP,
  sortOrderAtEnd,
  sortOrderBetween,
} from './sort-order';

describe('sort order', () => {
  it('RF-301: the first item starts one gap in', () => {
    expect(sortOrderAtEnd(null)).toBe(SORT_ORDER_GAP);
  });

  it('places the next item one gap after the last', () => {
    expect(sortOrderAtEnd(SORT_ORDER_GAP)).toBe(SORT_ORDER_GAP * 2n);
  });

  it('inserts halfway between two neighbors', () => {
    const placed = sortOrderBetween(SORT_ORDER_GAP, SORT_ORDER_GAP * 2n);
    expect(placed).toEqual({ kind: 'placed', sortOrder: SORT_ORDER_GAP + SORT_ORDER_GAP / 2n });
  });

  it('starts at the gap when both neighbors are missing', () => {
    expect(sortOrderBetween(null, null)).toEqual({ kind: 'placed', sortOrder: SORT_ORDER_GAP });
  });

  it('appends one gap after the previous item', () => {
    expect(sortOrderBetween(SORT_ORDER_GAP, null)).toEqual({
      kind: 'placed',
      sortOrder: SORT_ORDER_GAP * 2n,
    });
  });

  it('inserts before the first item when there is room', () => {
    expect(sortOrderBetween(null, SORT_ORDER_GAP)).toEqual({
      kind: 'placed',
      sortOrder: SORT_ORDER_GAP / 2n,
    });
  });

  it('asks for a rebalance when the gap is exhausted', () => {
    expect(sortOrderBetween(10n, 11n)).toEqual({ kind: 'rebalance' });
    expect(sortOrderBetween(null, 1n)).toEqual({ kind: 'rebalance' });
    expect(sortOrderBetween(20n, 10n)).toEqual({ kind: 'rebalance' });
  });

  it('rebuilds a dense list with the standard gap', () => {
    expect(rebalancedSortOrders(3)).toEqual([
      SORT_ORDER_GAP,
      SORT_ORDER_GAP * 2n,
      SORT_ORDER_GAP * 3n,
    ]);
    expect(rebalancedSortOrders(0)).toEqual([]);
  });
});
