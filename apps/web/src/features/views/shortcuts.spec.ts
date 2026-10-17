import { describe, expect, it } from 'vitest';
import { isPaletteShortcut } from './shortcuts';

describe('command palette shortcut', () => {
  it('RF-1502: / and Ctrl/Cmd+K open the palette, but / does not steal a text field', () => {
    expect(
      isPaletteShortcut({ key: '/', metaKey: false, ctrlKey: false, altKey: false, typing: false }),
    ).toBe(true);
    expect(
      isPaletteShortcut({ key: '/', metaKey: false, ctrlKey: false, altKey: false, typing: true }),
    ).toBe(false);
    expect(
      isPaletteShortcut({ key: 'k', metaKey: true, ctrlKey: false, altKey: false, typing: true }),
    ).toBe(true);
    expect(
      isPaletteShortcut({ key: 'k', metaKey: false, ctrlKey: true, altKey: false, typing: false }),
    ).toBe(true);
    expect(
      isPaletteShortcut({ key: 'k', metaKey: true, ctrlKey: false, altKey: true, typing: false }),
    ).toBe(false);
  });
});
