import { describe, expect, it } from 'vitest';
import { hourBlock, minutesInZone, layoutHourItems, limitHourLanes } from './hour';

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

it('TTD-AUD-87: caps overlapping lanes at 64px plus 2px gap and exposes every hidden item', () => {
  const layout = layoutHourItems(
    Array.from({ length: 6 }, (_, index) => ({ id: String(index), start: 600, end: 660 })),
  );
  const result = limitHourLanes(layout, 196);
  expect(result.visible).toHaveLength(2);
  expect(result.visible.every((item) => item.lanes === 3)).toBe(true);
  expect(result.overflow).toMatchObject([{ count: 4, start: 600, end: 660, lane: 2, lanes: 3 }]);
  const normal = limitHourLanes(
    layoutHourItems([
      { id: 'a', start: 600, end: 660 },
      { id: 'b', start: 600, end: 660 },
    ]),
    130,
  );
  expect(normal.visible).toHaveLength(2);
  expect(normal.overflow).toEqual([]);
});
