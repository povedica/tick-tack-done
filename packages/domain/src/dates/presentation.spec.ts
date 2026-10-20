import { describe, expect, it } from 'vitest';
import { humanDate } from './presentation';

describe('human calendar dates', () => {
  it('keeps date-only values stable and uses the requested zone for instants', () => {
    expect(humanDate('2026-10-25')).toBe('25 oct 2026');
    expect(humanDate('2026-10-25T00:30:00Z', 'es-ES', 'America/New_York')).toBe('24 oct 2026');
    expect(humanDate('invalid')).toBe('invalid');
  });
});
