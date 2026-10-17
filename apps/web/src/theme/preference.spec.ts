import { describe, expect, it } from 'vitest';
import {
  nextTheme,
  readThemePreference,
  resolveTheme,
  writeThemePreference,
  type ThemePreference,
} from './preference';

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe('theme preference', () => {
  it('UI-D4: auto follows the system and an explicit choice wins', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('persists only light, dark, or auto', () => {
    const storage = memory();
    expect(readThemePreference(storage)).toBe('auto');
    writeThemePreference(storage, 'dark');
    expect(readThemePreference(storage)).toBe('dark');
    storage.setItem('tick-tack-done.theme', 'sepia');
    expect(readThemePreference(storage)).toBe('auto');
  });

  it('cycles auto, light, then dark', () => {
    const order: ThemePreference[] = ['auto', 'light', 'dark'];
    expect(order.map((item) => nextTheme(item))).toEqual(['light', 'dark', 'auto']);
  });
});
