import { describe, expect, it } from 'vitest';
import { formatFocusDuration } from './text';

describe('formatFocusDuration (TTD-AUD-10)', () => {
  it('rounds fractional minutes and never shows decimals', () => {
    expect(formatFocusDuration(1.35, 'es-ES')).toBe('1 min');
    expect(formatFocusDuration(1.35, 'en-US')).toBe('1 min');
    expect(formatFocusDuration(397, 'es-ES')).toBe('6 h 37 min');
    expect(formatFocusDuration(90.4, 'es-ES')).toBe('1 h 30 min');
  });
});
