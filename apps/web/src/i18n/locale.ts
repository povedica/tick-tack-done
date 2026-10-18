import { create } from 'zustand';

export type LocaleChoice = 'auto' | 'es' | 'en';

const KEY = 'tick-tack-done.locale';

function read(): LocaleChoice {
  try {
    const value = localStorage.getItem(KEY);
    if (value === 'es' || value === 'en' || value === 'auto') {
      return value;
    }
  } catch {
    return 'es';
  }
  return 'es';
}

interface LocaleStore {
  choice: LocaleChoice;
  setChoice: (choice: LocaleChoice) => void;
}

export const useLocale = create<LocaleStore>((set) => ({
  choice: read(),
  setChoice: (choice) => {
    localStorage.setItem(KEY, choice);
    document.documentElement.lang = choice === 'auto' ? navigator.language : choice;
    set({ choice });
  },
}));
