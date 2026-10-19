import { describe, expect, it } from 'vitest';
import { GO_PATHS, SHORTCUT_ROWS } from './shortcuts';

describe('settings shortcut list', () => {
  it('every go-chord on the settings page has a handler', () => {
    const chords = SHORTCUT_ROWS.filter(([keys]) => keys.startsWith('G ')).map(([keys]) => keys);
    expect(chords.length).toBeGreaterThan(0);
    for (const keys of chords) {
      const letter = keys.slice(2).toLowerCase();
      expect(GO_PATHS[letter]).toEqual(expect.any(String));
    }
  });
});
