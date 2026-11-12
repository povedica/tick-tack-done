/**
 * First paint of the year (§5.5): the focus month and its two neighbours.
 * A quarter (three months or fewer) is already the whole view.
 */
export function firstPaintMonths(shown: readonly number[], focusMonth: number): readonly number[] {
  if (shown.length <= 3) {
    return shown;
  }
  const near = new Set([focusMonth - 1, focusMonth, focusMonth + 1]);
  const first = shown.filter((month) => near.has(month));
  return first.length > 0 ? first : shown.slice(0, 3);
}
