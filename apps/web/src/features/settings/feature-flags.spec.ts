import { describe, expect, it } from 'vitest';
import { DEFAULT_FEATURES, featureFlags } from './feature-flags';

describe('feature flags', () => {
  it('keeps every module on when the account has no preference', () => {
    expect(featureFlags(undefined)).toEqual(DEFAULT_FEATURES);
    expect(featureFlags({})).toEqual(DEFAULT_FEATURES);
  });

  it('turns off only the modules the account disabled', () => {
    expect(featureFlags({ matrix: false, focus: true })).toEqual({
      ...DEFAULT_FEATURES,
      matrix: false,
    });
  });

  it('TTD-AUD-63: ticky stays off unless explicitly enabled', () => {
    expect(featureFlags({}).ticky).toBe(false);
    expect(featureFlags({ ticky: true }).ticky).toBe(true);
    expect(featureFlags({ ticky: false }).ticky).toBe(false);
  });
});
