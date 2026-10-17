/** Manual ordering gap from section 6. Reorder is O(1) while a gap remains. */
export const SORT_ORDER_GAP = 65536n;

export type SortPlacement =
  | { readonly kind: 'placed'; readonly sortOrder: bigint }
  | { readonly kind: 'rebalance' };

export function sortOrderAtEnd(last: bigint | null): bigint {
  if (last === null) {
    return SORT_ORDER_GAP;
  }
  return last + SORT_ORDER_GAP;
}

/**
 * Place an item between two neighbors. `before` is the item that should stay
 * in front; `after` is the item that should stay behind. Either may be absent
 * at the ends of the list.
 */
export function sortOrderBetween(before: bigint | null, after: bigint | null): SortPlacement {
  if (before !== null && after !== null) {
    if (after <= before || after - before <= 1n) {
      return { kind: 'rebalance' };
    }
    return { kind: 'placed', sortOrder: before + (after - before) / 2n };
  }
  if (after !== null) {
    if (after <= 1n) {
      return { kind: 'rebalance' };
    }
    return { kind: 'placed', sortOrder: after / 2n };
  }
  if (before === null) {
    return { kind: 'placed', sortOrder: SORT_ORDER_GAP };
  }
  return { kind: 'placed', sortOrder: before + SORT_ORDER_GAP };
}

export function rebalancedSortOrders(count: number): bigint[] {
  return Array.from({ length: count }, (_, index) => SORT_ORDER_GAP * BigInt(index + 1));
}
