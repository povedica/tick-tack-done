export interface FeatureFlags {
  readonly countdowns: boolean;
  readonly focus: boolean;
  readonly matrix: boolean;
  readonly when_deadline: boolean;
  readonly day_load: boolean;
  readonly day_closing: boolean;
  readonly day_replan: boolean;
}

export function featureFlags(value: unknown): FeatureFlags {
  const row = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return {
    countdowns: row.countdowns !== false,
    focus: row.focus !== false,
    matrix: row.matrix !== false,
    when_deadline: row.when_deadline !== false,
    day_load: row.day_load !== false,
    day_closing: row.day_closing !== false,
    day_replan: row.day_replan !== false,
  };
}
