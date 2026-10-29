import { describe, expect, it } from 'vitest';
import { taskRangeWhere } from './task-range.js';

describe('taskRangeWhere', () => {
  const from = new Date('2026-06-01T00:00:00.000Z');
  const to = new Date('2026-06-02T00:00:00.000Z');

  it('includes an interval that overlaps the window', () => {
    expect(taskRangeWhere(from, to, 'any')).toEqual({
      OR: [
        { dueDate: { gte: from, lt: to } },
        { startDate: { gte: from, lt: to } },
        { startDate: { not: null, lt: to }, dueDate: { not: null, gte: from } },
      ],
    });
  });

  it('keeps a single bound when only one side is set', () => {
    expect(taskRangeWhere(from, undefined, 'due')).toEqual({ dueDate: { gte: from } });
    expect(taskRangeWhere(undefined, to, 'start')).toEqual({ startDate: { lt: to } });
  });

  it('returns null when the caller did not ask for a range', () => {
    expect(taskRangeWhere(undefined, undefined, 'any')).toBeNull();
  });
});
