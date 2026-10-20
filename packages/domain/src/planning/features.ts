export const FEATURE_FLAG_KEYS = [
  'when_deadline',
  'day_load',
  'day_closing',
  'day_replan',
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

/** Missing keys stay on. Only an explicit false hides the UI or the shutdown reminder. */
export function featureEnabled(flags: unknown, key: FeatureFlagKey): boolean {
  if (typeof flags !== 'object' || flags === null || Array.isArray(flags)) {
    return true;
  }
  return (flags as Record<string, unknown>)[key] !== false;
}

export function sanitizeFeatureFlags(
  value: unknown,
): { readonly ok: true; readonly flags: Record<string, boolean> } | { readonly ok: false } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false };
  }
  const flags: Record<string, boolean> = {};
  for (const [key, enabled] of Object.entries(value)) {
    if (!FEATURE_FLAG_KEYS.some((known) => known === key) || typeof enabled !== 'boolean') {
      return { ok: false };
    }
    flags[key] = enabled;
  }
  return { ok: true, flags };
}
