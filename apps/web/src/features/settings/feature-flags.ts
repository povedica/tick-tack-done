import { create } from 'zustand';

export interface FeatureFlags {
  readonly countdowns: boolean;
  readonly focus: boolean;
  readonly matrix: boolean;
}

export const DEFAULT_FEATURES: FeatureFlags = {
  countdowns: true,
  focus: true,
  matrix: true,
};

export function featureFlags(value: unknown): FeatureFlags {
  const row = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return {
    countdowns: row.countdowns !== false,
    focus: row.focus !== false,
    matrix: row.matrix !== false,
  };
}

interface FeatureStore {
  readonly flags: FeatureFlags;
  readonly setFlags: (flags: FeatureFlags) => void;
}

export const useFeatures = create<FeatureStore>((set) => ({
  flags: DEFAULT_FEATURES,
  setFlags: (flags) => {
    set({ flags });
  },
}));
