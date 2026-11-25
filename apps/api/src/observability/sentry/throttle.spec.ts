import { describe, expect, it } from 'vitest';
import { EventThrottle, throttleLimits } from './throttle.js';

describe('EventThrottle', () => {
  it('production: 10 per fingerprint every 10 minutes', () => {
    let now = 0;
    const throttle = new EventThrottle(throttleLimits('production'), () => now);
    const admitted = Array.from({ length: 12 }, () => throttle.admit('a')).filter(Boolean);
    expect(admitted).toHaveLength(10);
    expect(throttle.takeSuppressed()).toBe(2);
    now = 10 * 60_000;
    expect(throttle.admit('a')).toBe(true);
  });

  it('production: at most 60 per hour across fingerprints', () => {
    const throttle = new EventThrottle(throttleLimits('production'), () => 0);
    const admitted = Array.from({ length: 70 }, (_, index) => throttle.admit(`f${String(index)}`));
    expect(admitted.filter(Boolean)).toHaveLength(60);
    expect(throttle.takeSuppressed()).toBe(10);
    expect(throttle.takeSuppressed()).toBe(0);
  });

  it('staging: 3 per fingerprint per hour', () => {
    let now = 0;
    const throttle = new EventThrottle(throttleLimits('staging'), () => now);
    expect([1, 2, 3, 4].map(() => throttle.admit('a'))).toEqual([true, true, true, false]);
    now = 30 * 60_000;
    expect(throttle.admit('a')).toBe(false);
    now = 60 * 60_000;
    expect(throttle.admit('a')).toBe(true);
  });
});
