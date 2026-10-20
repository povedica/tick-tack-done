import { describe, expect, it } from 'vitest';
import { formatDuration, formatDurationMinutes } from './duration';

describe('formatDuration', () => {
  it('turns 132:09 of minutes and seconds into hours', () => {
    expect(formatDuration(132 * 60 + 9)).toBe('2 h 12 min');
  });

  it('uses days after two full days', () => {
    expect(formatDuration(5 * 24 * 60 * 60 + 12 * 60 * 60)).toBe('5 d 12 h');
  });

  it('TSK-3: humanizes long minute totals', () => {
    expect(formatDurationMinutes(8820)).toBe('6 d 3 h');
    expect(formatDurationMinutes(45)).toBe('45 min');
    expect(formatDurationMinutes(90)).toBe('1 h 30 min');
  });
});
