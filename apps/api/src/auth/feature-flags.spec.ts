import { navigationOrder } from '@reflexionia/domain';
import { describe, expect, it } from 'vitest';
import { featureFlags } from './feature-flags.js';

const ALL_ON = {
  navigation_order: navigationOrder(undefined),
  countdowns: true,
  focus: true,
  matrix: true,
  when_deadline: true,
  day_load: true,
  day_closing: true,
  day_replan: true,
};

describe('feature flags', () => {
  it('defaults every module on', () => {
    expect(featureFlags(null)).toEqual(ALL_ON);
  });

  it('reads an explicit off switch', () => {
    expect(featureFlags({ countdowns: false })).toEqual({
      ...ALL_ON,
      countdowns: false,
    });
  });
});
