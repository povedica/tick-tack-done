import { describe, expect, it } from 'vitest';
import { isFilterMenuShortcut } from './filter-menu-key';

describe('isFilterMenuShortcut', () => {
  it('accepts the Menu key and Shift+F10', () => {
    expect(isFilterMenuShortcut({ key: 'ContextMenu', shiftKey: false })).toBe(true);
    expect(isFilterMenuShortcut({ key: 'F10', shiftKey: true })).toBe(true);
    expect(isFilterMenuShortcut({ key: 'F10', shiftKey: false })).toBe(false);
    expect(isFilterMenuShortcut({ key: 'Enter', shiftKey: true })).toBe(false);
  });
});
