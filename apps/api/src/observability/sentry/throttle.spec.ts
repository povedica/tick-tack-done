import { describe, expect, it } from 'vitest';
import { DAILY_EVENT_CAP, EventThrottle, throttleLimits } from './throttle.js';

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

  it('caps a process at 160 events per rolling day, under the free monthly quota', () => {
    let now = 0;
    const limits = throttleLimits('production');
    expect(limits.perDay).toBe(DAILY_EVENT_CAP);
    expect(throttleLimits('staging').perDay).toBe(DAILY_EVENT_CAP);
    const throttle = new EventThrottle(limits, () => now);
    let admitted = 0;
    for (let hour = 0; hour < 24; hour += 1) {
      now = hour * 60 * 60_000;
      for (let index = 0; index < limits.perHour; index += 1) {
        if (throttle.admit(`h${String(hour)}-${String(index)}`)) admitted += 1;
      }
    }
    // 60/hour would be 1_440/day and would exhaust 5_000 errors in about 3.5 days.
    expect(admitted).toBe(DAILY_EVENT_CAP);
    expect(throttle.takeSuppressed()).toBe(24 * limits.perHour - DAILY_EVENT_CAP);
    now = 24 * 60 * 60_000;
    expect(throttle.admit('next-day')).toBe(true);
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
