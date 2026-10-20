import { describe, expect, it } from 'vitest';
import { DEFAULT_WIDGETS, parseLayout } from './model';

describe('garden layout from the public API', () => {
  it('uses defaults only before a saved layout exists, allowing an intentionally empty garden', () => {
    expect(parseLayout(undefined)).toEqual(DEFAULT_WIDGETS);
    expect(parseLayout([])).toEqual([]);
  });
  it('preserves saved ordering and size while excluding duplicate or unsupported widgets', () => {
    expect(
      parseLayout([
        { widget_key: 'habits', position: 3, size: 'l' },
        { widget_key: 'flow', position: 1, size: 's' },
        { widget_key: 'flow', position: 2, size: 'm' },
        { widget_key: 'unknown', position: 0 },
      ]),
    ).toEqual([
      { widget_key: 'flow', size: 's' },
      { widget_key: 'habits', size: 'l' },
    ]);
  });
});
