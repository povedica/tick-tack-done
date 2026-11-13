import { create } from 'zustand';
import { loadMessages } from './catalog';
import { pushAccount } from '../theme/push-account';

export type LocaleChoice = 'auto' | 'es' | 'en';

const KEY = 'tick-tack-done.locale';

export function readLocaleChoice(): LocaleChoice {
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
  setChoice: (choice: LocaleChoice, source?: 'user' | 'account') => void;
}

export function resolveLocale(choice: LocaleChoice): string {
  return choice === 'auto' ? navigator.language : choice;
}

export function useAppLocale(): string {
  const choice = useLocale((state) => state.choice);
  return resolveLocale(choice);
}

export const useLocale = create<LocaleStore>((set) => ({
  choice: readLocaleChoice(),
  setChoice: (choice, source = 'user') => {
    const locale = resolveLocale(choice);
    void loadMessages(locale).then(
      () => {
        localStorage.setItem(KEY, choice);
        document.documentElement.lang = locale;
        set({ choice });
        if (source === 'user') {
          pushAccount({ locale: choice });
        }
      },
      () => undefined,
    );
  },
}));
