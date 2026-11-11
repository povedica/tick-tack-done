import { describe, expect, it } from 'vitest';
import { filterMove } from './filter-order';

const rows = [
  { id: 'c', pinned: true },
  { id: 'a', pinned: false },
  { id: 'b', pinned: false },
];

describe('filterMove', () => {
  it('inserts before a row in the same block and sends the last row to the end', () => {
    expect(filterMove(rows, 'b', 'a', false)).toEqual({ before_id: 'a' });
    expect(filterMove(rows, 'a', 'b', true)).toEqual({ move_to_end: true });
    expect(filterMove(rows, 'a', 'b', false)).toEqual({ before_id: 'b' });
  });

  it('refuses to cross the pinned block', () => {
    expect(filterMove(rows, 'a', 'c', false)).toBeNull();
    expect(filterMove(rows, 'c', 'b', true)).toBeNull();
  });
});
