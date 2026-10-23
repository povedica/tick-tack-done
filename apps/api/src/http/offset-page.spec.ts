import { describe, expect, it } from 'vitest';
import { offsetCursor, offsetOf, offsetPage } from './offset-page.js';
describe('TTD-AUD-83 opaque offset pages', () => {
  it('round-trips pages without repeating rows', () => {
    const rows = ['a', 'b', 'c'];
    const first = offsetPage(rows, 0, 2);
    expect(first.items).toEqual(['a', 'b']);
    expect(offsetOf(first.next_cursor)).toBe(2);
    expect(offsetPage(rows, offsetOf(first.next_cursor), 2)).toEqual({
      items: ['c'],
      next_cursor: null,
    });
    expect(offsetOf(undefined)).toBe(0);
  });
  it.each(['garbage', offsetCursor(-1), offsetCursor(100_001), offsetCursor(1.5)])(
    'rejects invalid cursor %s',
    (cursor) => {
      expect(() => offsetOf(cursor)).toThrow('Invalid opaque cursor');
    },
  );
});
