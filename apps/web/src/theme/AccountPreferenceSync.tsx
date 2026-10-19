import type { Me } from '@reflexionia/sdk';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '../api';
import { useLocale, type LocaleChoice } from '../i18n/locale';
import { isThemePreference, type ThemePreference } from './preference';
import { usePreferences, type AccentId, type Density, type WeekStart } from './preferences';
import { notifyAccountSaveFailed } from './push-account';
import { useThemePreference } from './store';

const SYNCED = 'tick-tack-done.account-prefs';

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function choice(value: string): LocaleChoice {
  if (value === 'auto' || value === 'en' || value === 'es') {
    return value;
  }
  return 'es';
}

function accent(value: string): AccentId {
  if (
    value === 'violet' ||
    value === 'teal' ||
    value === 'amber' ||
    value === 'rose' ||
    value === 'slate' ||
    value === 'indigo'
  ) {
    return value;
  }
  return 'indigo';
}

function applyServer(me: Me): void {
  const row = me as unknown as Record<string, unknown>;
  const theme = text(row.theme);
  if (isThemePreference(theme)) {
    useThemePreference.getState().setPreference(theme, 'account');
  }
  const density: Density = row.density === 'compact' ? 'compact' : 'comfortable';
  usePreferences.getState().setDensity(density, 'account');
  usePreferences.getState().setAccent(accent(text(row.accent)), 'account');
  const week: WeekStart = row.week_start === 'sunday' ? 'sunday' : 'monday';
  usePreferences.getState().setWeekStart(week, 'account');
  usePreferences.getState().setParser(choice(text(row.nlp_language)), 'account');
  useLocale.getState().setChoice(choice(text(row.locale)), 'account');
}

export function AccountPreferenceSync() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const started = useRef(false);
  useEffect(() => {
    if (started.current || me.data === undefined) {
      return;
    }
    started.current = true;
    let synced = false;
    try {
      synced = localStorage.getItem(SYNCED) === '1';
    } catch {
      synced = false;
    }
    if (synced) {
      applyServer(me.data);
      return;
    }
    const look = usePreferences.getState();
    const theme: ThemePreference = useThemePreference.getState().preference;
    const locale = useLocale.getState().choice;
    void pushUpload({
      theme,
      density: look.density,
      accent: look.accent,
      week_start: look.weekStart,
      locale,
      nlp_language: look.parser,
    });
  }, [me.data]);
  return null;
}

function pushUpload(body: {
  theme: ThemePreference;
  density: Density;
  accent: AccentId;
  week_start: WeekStart;
  locale: LocaleChoice;
  nlp_language: 'auto' | 'es' | 'en';
}): Promise<void> {
  return api.updateMe(body).then(
    () => {
      try {
        localStorage.setItem(SYNCED, '1');
      } catch {
        return;
      }
    },
    () => {
      notifyAccountSaveFailed();
    },
  );
}
