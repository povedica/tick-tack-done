import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  rangeFor,
  shiftRange,
  mondayOf,
  validDay,
  formatDuration,
  formatHumanDay,
  readStatsState,
  writeStatsState,
  readStoredRange,
  writeStoredRange,
} from './range';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('RF-2321 statistics navigation', () => {
  it('RF-2321: URL dates remain authoritative for predefined historical ranges', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    for (const key of ['week', 'month', 'year'] as const)
      expect(rangeFor(key, 'Europe/Madrid', { from: '2026-01-01', to: '2026-01-07' })).toEqual({
        from: '2026-01-01',
        to: '2026-01-07',
      });
    expect(rangeFor('week', 'Europe/Madrid')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(rangeFor('today', 'Europe/Madrid')).toEqual({ from: '2026-10-20', to: '2026-10-20' });
    expect(rangeFor('month', 'Europe/Madrid')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(rangeFor('year', 'Europe/Madrid')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(shiftRange('week', '2026-10-19', '2026-10-25', -1)).toEqual({
      from: '2026-10-12',
      to: '2026-10-18',
    });
    expect(shiftRange('month', '2024-01-01', '2024-01-31', 1)).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
    });
    expect(shiftRange('year', '2026-01-01', '2026-12-31', -1)).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
    expect(mondayOf('2026-10-25')).toBe('2026-10-19');
  });
  it('RF-2321: custom dates, filters and day survive local storage and invalid dates fail', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
    const state =
      'range=custom&from=2026-10-01&to=2026-10-20&list=l&tag=t&priority=high&day=2026-10-19';
    writeStatsState(state);
    expect(readStatsState()).toBe(state);
    writeStoredRange('month');
    expect(readStoredRange()).toBe('month');
    expect(validDay('2026-02-30')).toBe(false);
    expect(validDay('2024-02-29')).toBe(true);
    expect(validDay('invalid')).toBe(false);
    expect(formatDuration(132)).toBe('2 h 12 min');
    expect(formatHumanDay('2026-10-19')).toContain('19');
  });
});
