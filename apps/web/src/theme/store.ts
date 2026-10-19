import { create } from 'zustand';
import { readThemePreference, writeThemePreference, type ThemePreference } from './preference';
import { pushAccount } from './push-account';

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
  setPreference: (preference: ThemePreference, source?: 'user' | 'account') => void;
}

export const useThemePreference = create<ThemeStore>((set) => ({
  preference: readThemePreference(storage()),
  setPreference: (preference, source = 'user') => {
    writeThemePreference(storage(), preference);
    set({ preference });
    if (source === 'user') {
      pushAccount({ theme: preference });
    }
  },
}));
