import { expect, it } from 'vitest';
import { sourceSelected, toggleSource } from './source-selection';

it('TTD-AUD-93: missing means all, dash means none, toggling preserves multiple selections', () => {
  expect(sourceSelected(null, 'a')).toBe(true);
  expect(toggleSource(null, 'a', ['a', 'b'])).toBe('b');
  expect(toggleSource('b', 'b', ['a', 'b'])).toBe('-');
  expect(sourceSelected('-', 'a')).toBe(false);
  expect(toggleSource('-', 'a', ['a', 'b'])).toBe('a');
  expect(toggleSource('a', 'b', ['a', 'b'])).toBeNull();
});
