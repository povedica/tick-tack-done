import { describe, expect, it } from 'vitest';
import { bucketWeek } from './week-metrics';

describe('bucketWeek', () => {
  it('RF-2201: counts created and completed tasks on the day they happened', () => {
    const start = '2026-10-12T00:00:00.000Z';
    const days = bucketWeek(start, [
      {
        createdAt: '2026-10-12T09:00:00.000Z',
        completedAt: '2026-10-13T18:00:00.000Z',
      },
      {
        createdAt: '2026-10-01T09:00:00.000Z',
        completedAt: '2026-10-12T11:00:00.000Z',
      },
    ]);
    expect(days[0]).toEqual({ date: '2026-10-12', completed: 1, created: 1 });
    expect(days[1]).toEqual({ date: '2026-10-13', completed: 1, created: 0 });
    expect(days).toHaveLength(7);
  });
});

it('RF-2201 / RF-604: buckets use local days at midnight and DST boundaries', () => {
  const days = bucketWeek(
    '2026-10-19T00:00:00Z',
    [
      {
        createdAt: '2026-10-18T22:30:00Z',
        completedAt: '2026-10-24T22:30:00Z',
      },
      { createdAt: '2026-10-25T23:30:00Z', completedAt: null },
    ],
    'Europe/Madrid',
  );
  expect(days[0]?.created).toBe(1);
  expect(days[6]?.completed).toBe(1);
  expect(days.reduce((sum, day) => sum + day.created, 0)).toBe(1);
});

it('RF-2201: a task created before the cutoff does not count its future completion', () => {
  const days = bucketWeek(
    '2026-10-19T00:00:00Z',
    [
      {
        createdAt: '2026-10-19T08:00:00Z',
        completedAt: '2026-10-23T08:00:00Z',
      },
    ],
    'Europe/Madrid',
    '2026-10-20T12:00:00Z',
  );
  expect(days.reduce((sum, day) => sum + day.created, 0)).toBe(1);
  expect(days.reduce((sum, day) => sum + day.completed, 0)).toBe(0);
});
