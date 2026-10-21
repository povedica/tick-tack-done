import { describe, expect, it } from 'vitest';
import { DEFAULT_FEATURES } from '../features/settings/feature-flags';
import { moduleEnabled } from './modules';

describe('moduleEnabled (TTD-AUD-63)', () => {
  it('hides ticky unless the user flag and server availability are both on', () => {
    expect(moduleEnabled('ticky', { ...DEFAULT_FEATURES, ticky: false }, true)).toBe(false);
    expect(moduleEnabled('ticky', { ...DEFAULT_FEATURES, ticky: true }, false)).toBe(false);
    expect(moduleEnabled('ticky', { ...DEFAULT_FEATURES, ticky: true }, true)).toBe(true);
  });

  it('respects the habits preference', () => {
    expect(moduleEnabled('habits', { ...DEFAULT_FEATURES, habits: false })).toBe(false);
    expect(moduleEnabled('habits', { ...DEFAULT_FEATURES, habits: true })).toBe(true);
  });
});
