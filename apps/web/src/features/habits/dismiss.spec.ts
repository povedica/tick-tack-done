import { describe, expect, it } from 'vitest';
import { habitsDismissed } from './dismiss';

describe('habits dismiss', () => {
  it('hides the empty card for seven days', () => {
    const now = Date.parse('2026-10-19T10:00:00.000Z');
    expect(habitsDismissed(null, now)).toBe(false);
    expect(habitsDismissed(String(now - 6 * 24 * 60 * 60 * 1000), now)).toBe(true);
    expect(habitsDismissed(String(now - 8 * 24 * 60 * 60 * 1000), now)).toBe(false);
  });
});
