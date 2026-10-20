import { describe, expect, it } from 'vitest';
import { featureFlags } from './feature-flags';

describe('feature flags', () => {
  it('keeps every module on when the account has no preference', () => {
    expect(featureFlags(undefined)).toEqual({ countdowns: true, focus: true, matrix: true });
    expect(featureFlags({})).toEqual({ countdowns: true, focus: true, matrix: true });
  });

  it('turns off only the modules the account disabled', () => {
    expect(featureFlags({ matrix: false, focus: true })).toEqual({
      countdowns: true,
      focus: true,
      matrix: false,
    });
  });
});
