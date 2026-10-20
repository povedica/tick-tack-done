import { describe, expect, it } from 'vitest';
import { hourBlock, minutesInZone } from './hour';

describe('hour grid', () => {
  it('reads a zoned clock', () => {
    expect(minutesInZone('2026-10-20T16:20:00.000Z', 'Europe/Madrid')).toBe(18 * 60 + 20);
  });

  it('places a block under the 6:00 line', () => {
    const box = hourBlock(18 * 60 + 20, 19 * 60 + 40);
    expect(box.top).toBe((12 * 60 + 20) * (48 / 60));
    expect(box.height).toBe(80 * (48 / 60));
  });
});
