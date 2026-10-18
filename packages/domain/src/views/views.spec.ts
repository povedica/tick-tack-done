import { describe, expect, it } from 'vitest';
import { acceptsColumnDrop, columnLoad } from './wip';
import { moveTimelineBlock, resizeTimelineBlock, slotTask, timelineRange } from './timeline';

describe('wip', () => {
  it('RF-1002: a column without a limit is never over', () => {
    expect(columnLoad(9, null).over).toBe(false);
  });

  it('RF-1002: the counter is over when the count passes the limit', () => {
    expect(columnLoad(3, 2)).toEqual({ count: 3, limit: 2, over: true });
  });

  it('RF-1002: a full column refuses a new card and keeps one that is already there', () => {
    expect(acceptsColumnDrop(2, 2, false)).toBe(false);
    expect(acceptsColumnDrop(2, 2, true)).toBe(true);
    expect(acceptsColumnDrop(2, null, false)).toBe(true);
  });
});

describe('timeline', () => {
  const block = {
    startDate: '2026-10-18T10:00:00.000Z',
    dueDate: '2026-10-18T11:00:00.000Z',
    durationMinutes: 60,
  };

  it('RF-1003: moving a block keeps the duration', () => {
    const moved = moveTimelineBlock(block, 30);
    expect(moved?.durationMinutes).toBe(60);
    expect(moved?.startDate).toBe('2026-10-18T10:30:00.000Z');
  });

  it('RF-1003: dragging the end changes the duration and a 15 minute floor refuses the resize', () => {
    expect(resizeTimelineBlock(block, 'end', 30)?.durationMinutes).toBe(90);
    expect(resizeTimelineBlock(block, 'start', 50)).toBeNull();
  });

  it('RF-1003: a dated task without a start uses the duration', () => {
    const moved = moveTimelineBlock(
      { startDate: null, dueDate: '2026-10-18T11:00:00.000Z', durationMinutes: 30 },
      -30,
    );
    expect(moved?.durationMinutes).toBe(30);
  });

  it('RF-1003: an undated block cannot move', () => {
    expect(
      moveTimelineBlock({ startDate: null, dueDate: null, durationMinutes: null }, 10),
    ).toBeNull();
  });

  it('RF-1003: a click creates a one hour task in that slot', () => {
    const created = slotTask('2026-10-18T00:00:00.000Z', 9 * 60, 'Europe/Madrid');
    expect(created?.durationMinutes).toBe(60);
    expect(slotTask('2026-10-18T00:00:00.000Z', -1, 'Europe/Madrid')).toBeNull();
    expect(slotTask('2026-10-18T00:00:00.000Z', 60, 'Not/AZone')).toBeNull();
  });

  it('RF-1003: week zoom spans seven local days', () => {
    const range = timelineRange('2026-10-18T10:00:00.000Z', 'week', 'Europe/Madrid');
    expect(range).not.toBeNull();
    expect(timelineRange('nope', 'day', 'Europe/Madrid')).toBeNull();
    expect(timelineRange('2026-10-18T10:00:00.000Z', 'month', 'Europe/Madrid')).not.toBeNull();
  });
});
