import { describe, expect, it } from 'vitest';
import { formatDuration } from './duration';

describe('formatDuration', () => {
  it('turns 132:09 of minutes and seconds into hours', () => {
    expect(formatDuration(132 * 60 + 9)).toBe('2 h 12 min');
  });

  it('uses days after two full days', () => {
    expect(formatDuration(5 * 24 * 60 * 60 + 12 * 60 * 60)).toBe('5 d 12 h');
  });
});
