export interface FeatureFlags {
  readonly countdowns: boolean;
  readonly focus: boolean;
  readonly matrix: boolean;
}

export function featureFlags(value: unknown): FeatureFlags {
  const row = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return {
    countdowns: row.countdowns !== false,
    focus: row.focus !== false,
    matrix: row.matrix !== false,
  };
}
