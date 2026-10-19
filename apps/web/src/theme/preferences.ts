import { create } from 'zustand';
import { pushAccount } from './push-account';

type PreferenceSource = 'user' | 'account';

export type Density = 'comfortable' | 'compact';
export type AccentId = 'indigo' | 'violet' | 'teal' | 'amber' | 'rose' | 'slate';
export type WeekStart = 'monday' | 'sunday';

const DENSITY = 'tick-tack-done.density';
const ACCENT = 'tick-tack-done.accent';
const WEEK = 'tick-tack-done.week-start';
const COUNTERS = 'tick-tack-done.counters';
const PARSER = 'tick-tack-done.parser';

function readDensity(): Density {
  return localStorage.getItem(DENSITY) === 'compact' ? 'compact' : 'comfortable';
}

function readAccent(): AccentId {
  const value = localStorage.getItem(ACCENT);
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

function readWeek(): WeekStart {
  return localStorage.getItem(WEEK) === 'sunday' ? 'sunday' : 'monday';
}

interface PreferenceStore {
  density: Density;
  accent: AccentId;
  weekStart: WeekStart;
  showCounters: boolean;
  parser: 'auto' | 'es' | 'en';
  setDensity: (density: Density, source?: PreferenceSource) => void;
  setAccent: (accent: AccentId, source?: PreferenceSource) => void;
  setWeekStart: (weekStart: WeekStart, source?: PreferenceSource) => void;
  setShowCounters: (showCounters: boolean) => void;
  setParser: (parser: 'auto' | 'es' | 'en', source?: PreferenceSource) => void;
}

export const usePreferences = create<PreferenceStore>((set) => ({
  density: readDensity(),
  accent: readAccent(),
  weekStart: readWeek(),
  showCounters: localStorage.getItem(COUNTERS) !== 'off',
  parser:
    localStorage.getItem(PARSER) === 'en' || localStorage.getItem(PARSER) === 'es'
      ? (localStorage.getItem(PARSER) as 'es' | 'en')
      : 'auto',
  setDensity: (density, source = 'user') => {
    localStorage.setItem(DENSITY, density);
    document.documentElement.dataset.density = density;
    set({ density });
    if (source === 'user') {
      pushAccount({ density });
    }
  },
  setAccent: (accent, source = 'user') => {
    localStorage.setItem(ACCENT, accent);
    document.documentElement.dataset.accent = accent;
    set({ accent });
    if (source === 'user') {
      pushAccount({ accent });
    }
  },
  setWeekStart: (weekStart, source = 'user') => {
    localStorage.setItem(WEEK, weekStart);
    set({ weekStart });
    if (source === 'user') {
      pushAccount({ week_start: weekStart });
    }
  },
  setShowCounters: (showCounters) => {
    localStorage.setItem(COUNTERS, showCounters ? 'on' : 'off');
    set({ showCounters });
  },
  setParser: (parser, source = 'user') => {
    localStorage.setItem(PARSER, parser);
    set({ parser });
    if (source === 'user') {
      pushAccount({ nlp_language: parser });
    }
  },
}));

export function applyPreferences(density: Density, accent: AccentId): void {
  document.documentElement.dataset.density = density;
  document.documentElement.dataset.accent = accent;
}
