export interface FilterOrderRow {
  readonly id: string;
  readonly pinned: boolean;
}

export type FilterMove = { readonly before_id: string } | { readonly move_to_end: true };

/** Same pin block only. The lower half of the last row in that block goes to the end. */
export function filterMove(
  items: readonly FilterOrderRow[],
  sourceId: string,
  targetId: string,
  after: boolean,
): FilterMove | null {
  if (sourceId === targetId) {
    return null;
  }
  const source = items.find((item) => item.id === sourceId);
  const target = items.find((item) => item.id === targetId);
  if (source === undefined || target === undefined) {
    return null;
  }
  if (source.pinned !== target.pinned) {
    return null;
  }
  const group = items.filter((item) => item.pinned === source.pinned);
  const targetIndex = group.findIndex((item) => item.id === targetId);
  const next = group[targetIndex + 1];
  if (after) {
    if (next === undefined) {
      return { move_to_end: true };
    }
    if (next.id === sourceId) {
      return null;
    }
    return { before_id: next.id };
  }
  return { before_id: targetId };
}
