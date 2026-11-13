import { describe, expect, it } from 'vitest';
import { dateTimeFormat } from './formatters';

describe('dateTimeFormat', () => {
  it('reuses the formatter for the same locale and options', () => {
    const first = dateTimeFormat('es-ES', { month: 'long', day: 'numeric' });
    const second = dateTimeFormat('es-ES', { day: 'numeric', month: 'long' });
    expect(second).toBe(first);
    expect(first.format(new Date('2026-01-05T12:00:00Z'))).toBe(
      second.format(new Date('2026-01-05T12:00:00Z')),
    );
  });

  it('keeps a different formatter when the locale or options differ', () => {
    const spanish = dateTimeFormat('es-ES', { month: 'long' });
    const english = dateTimeFormat('en-GB', { month: 'long' });
    const withDay = dateTimeFormat('es-ES', { month: 'long', day: 'numeric' });
    expect(english).not.toBe(spanish);
    expect(withDay).not.toBe(spanish);
  });
});
