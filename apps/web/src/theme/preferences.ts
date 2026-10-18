import { create } from 'zustand';

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
  setDensity: (density: Density) => void;
  setAccent: (accent: AccentId) => void;
  setWeekStart: (weekStart: WeekStart) => void;
  setShowCounters: (showCounters: boolean) => void;
  setParser: (parser: 'auto' | 'es' | 'en') => void;
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
  setDensity: (density) => {
    localStorage.setItem(DENSITY, density);
    document.documentElement.dataset.density = density;
    set({ density });
  },
  setAccent: (accent) => {
    localStorage.setItem(ACCENT, accent);
    document.documentElement.dataset.accent = accent;
    set({ accent });
  },
  setWeekStart: (weekStart) => {
    localStorage.setItem(WEEK, weekStart);
    set({ weekStart });
  },
  setShowCounters: (showCounters) => {
    localStorage.setItem(COUNTERS, showCounters ? 'on' : 'off');
    set({ showCounters });
  },
  setParser: (parser) => {
    localStorage.setItem(PARSER, parser);
    set({ parser });
  },
}));

export function applyPreferences(density: Density, accent: AccentId): void {
  document.documentElement.dataset.density = density;
  document.documentElement.dataset.accent = accent;
}
