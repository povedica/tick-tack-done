import { describe, expect, it } from 'vitest';
import { featureFlags } from './feature-flags.js';

describe('feature flags', () => {
  it('defaults every module on', () => {
    expect(featureFlags(null)).toEqual({ countdowns: true, focus: true, matrix: true });
  });

  it('reads an explicit off switch', () => {
    expect(featureFlags({ countdowns: false })).toEqual({
      countdowns: false,
      focus: true,
      matrix: true,
    });
  });
});
