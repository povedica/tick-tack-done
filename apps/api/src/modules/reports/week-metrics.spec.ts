import { describe, expect, it } from 'vitest';
import { bucketWeek } from './week-metrics.js';

describe('bucketWeek', () => {
  it('counts created and completed tasks on the day they happened', () => {
    const start = new Date('2026-10-12T00:00:00.000Z');
    const days = bucketWeek(start, [
      {
        createdAt: new Date('2026-10-12T09:00:00.000Z'),
        completedAt: new Date('2026-10-13T18:00:00.000Z'),
      },
      {
        createdAt: new Date('2026-10-01T09:00:00.000Z'),
        completedAt: new Date('2026-10-12T11:00:00.000Z'),
      },
    ]);
    expect(days[0]).toEqual({ date: '2026-10-12', completed: 1, created: 1 });
    expect(days[1]).toEqual({ date: '2026-10-13', completed: 1, created: 0 });
    expect(days).toHaveLength(7);
  });
});
