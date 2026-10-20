import { describe, expect, it } from 'vitest';
import { featureFlags } from './feature-flags';

const ALL_ON = {
  countdowns: true,
  focus: true,
  matrix: true,
  when_deadline: true,
  day_load: true,
  day_closing: true,
  day_replan: true,
};
describe('feature flags', () => {
  it('keeps every module on when the account has no preference', () => {
    expect(featureFlags(undefined)).toEqual(ALL_ON);
    expect(featureFlags({})).toEqual(ALL_ON);
  });

  it('turns off only the modules the account disabled', () => {
    expect(featureFlags({ matrix: false, focus: true })).toEqual({
      ...ALL_ON,
      focus: true,
      matrix: false,
    });
  });
});
