import { rebalancedSortOrders, sortOrderAtEnd, sortOrderBetween } from '@reflexionia/domain';

export interface OrderedRow {
  readonly id: string;
  readonly sortOrder: bigint;
}

export interface SortPlan {
  readonly movingSortOrder: bigint;
  readonly updates: readonly { readonly id: string; readonly sortOrder: bigint }[];
}

export type Placement = { readonly end: true } | { readonly beforeId: string | null };

function byOrder(left: OrderedRow, right: OrderedRow): number {
  if (left.sortOrder < right.sortOrder) {
    return -1;
  }
  if (left.sortOrder > right.sortOrder) {
    return 1;
  }
  if (left.id < right.id) {
    return -1;
  }
  if (left.id > right.id) {
    return 1;
  }
  return 0;
}

/** O(1) while a gap remains. Rewrites siblings only when the gap is exhausted. */
export function planPlacement(
  rows: readonly OrderedRow[],
  movingId: string | null,
  placement: Placement,
): SortPlan {
  const others = rows.filter((row) => row.id !== movingId).sort(byOrder);
  if ('end' in placement) {
    return { movingSortOrder: sortOrderAtEnd(others.at(-1)?.sortOrder ?? null), updates: [] };
  }

  let index = 0;
  if (placement.beforeId !== null) {
    index = others.findIndex((row) => row.id === placement.beforeId);
    if (index < 0) {
      throw new Error('missing_neighbor');
    }
  }
  const before = index === 0 ? null : (others[index - 1]?.sortOrder ?? null);
  const after = others[index]?.sortOrder ?? null;
  const placed = sortOrderBetween(before, after);
  if (placed.kind === 'placed') {
    return { movingSortOrder: placed.sortOrder, updates: [] };
  }

  const orders = rebalancedSortOrders(others.length + 1);
  const movingSortOrder = orders[index];
  if (movingSortOrder === undefined) {
    throw new Error('rebalance_length');
  }
  const updates = others.map((row, rowIndex) => {
    const orderIndex = rowIndex < index ? rowIndex : rowIndex + 1;
    const sortOrder = orders[orderIndex];
    if (sortOrder === undefined) {
      throw new Error('rebalance_length');
    }
    return { id: row.id, sortOrder };
  });
  return { movingSortOrder, updates };
}
