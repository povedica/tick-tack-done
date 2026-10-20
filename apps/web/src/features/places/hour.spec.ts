import { describe, expect, it } from 'vitest';
import { hourBlock, minutesInZone, layoutHourItems } from './hour';

describe('hour grid', () => {
  it('reads a zoned clock', () => {
    expect(minutesInZone('2026-10-20T16:20:00.000Z', 'Europe/Madrid')).toBe(18 * 60 + 20);
  });

  it('places a block from midnight', () => {
    const box = hourBlock(18 * 60 + 20, 19 * 60 + 40);
    expect(box.top).toBe((18 * 60 + 20) * (48 / 60));
    expect(box.height).toBe(80 * (48 / 60));
  });
});

it('RF-1102: overlapping events occupy parallel lanes without losing midnight', () => {
  const items = layoutHourItems([
    { id: 'a', start: 0, end: 60 },
    { id: 'b', start: 30, end: 90 },
    { id: 'c', start: 90, end: 120 },
  ]);
  expect(items.map((item) => [item.id, item.lane, item.lanes])).toEqual([
    ['a', 0, 2],
    ['b', 1, 2],
    ['c', 0, 1],
  ]);
  expect(hourBlock(0, 60).top).toBe(0);
});
