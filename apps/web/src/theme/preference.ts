export type ThemePreference = 'light' | 'dark' | 'auto';

export const THEME_KEY = 'tick-tack-done.theme';

const PREFERENCES: readonly ThemePreference[] = ['auto', 'light', 'dark'];

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'auto';
}

export function readThemePreference(storage: Pick<Storage, 'getItem'>): ThemePreference {
  try {
    const value = storage.getItem(THEME_KEY);
    return isThemePreference(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function writeThemePreference(
  storage: Pick<Storage, 'setItem'>,
  preference: ThemePreference,
): void {
  storage.setItem(THEME_KEY, preference);
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): 'light' | 'dark' {
  if (preference === 'auto') {
    return prefersDark ? 'dark' : 'light';
  }
  return preference;
}

export function nextTheme(preference: ThemePreference): ThemePreference {
  const index = PREFERENCES.indexOf(preference);
  const next = PREFERENCES[(index + 1) % PREFERENCES.length];
  return next ?? 'auto';
}

export function applyTheme(preference: ThemePreference, prefersDark: boolean): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(preference, prefersDark);
  if (root.dataset.density !== 'compact' && root.dataset.density !== 'comfortable') {
    root.dataset.density = 'comfortable';
  }
}
