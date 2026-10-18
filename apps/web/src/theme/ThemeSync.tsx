import { useEffect } from 'react';
import { applyTheme } from './preference';
import { useThemePreference } from './store';

export function ThemeSync() {
  const preference = useThemePreference((state) => state.preference);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => {
      applyTheme(preference, media.matches);
    };
    apply();
    media.addEventListener('change', apply);
    return () => {
      media.removeEventListener('change', apply);
    };
  }, [preference]);

  return null;
}
