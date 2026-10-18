import { create } from 'zustand';
import { readThemePreference, writeThemePreference, type ThemePreference } from './preference';

function storage(): Pick<Storage, 'getItem' | 'setItem'> {
  if (typeof localStorage === 'undefined') {
    const data = new Map<string, string>();
    return {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
    };
  }
  return localStorage;
}

interface ThemeStore {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

export const useThemePreference = create<ThemeStore>((set) => ({
  preference: readThemePreference(storage()),
  setPreference: (preference) => {
    writeThemePreference(storage(), preference);
    set({ preference });
  },
}));
