import { describe, expect, it } from 'vitest';
import { gardenHabits, gardenTagActivity, uniqueGardenEvents } from './executive';

describe('executive garden projections (RF-2102)', () => {
  it('deduplicates shared calendar occurrences without collapsing recurring dates or unrelated events', () => {
    const event = {
      externalUid: 'copy-a',
      startsAt: new Date('2026-10-20T10:00Z'),
      raw: { iCalUID: 'shared' },
    };
    const copy = { ...event, externalUid: 'copy-b' };
    const next = { ...event, startsAt: new Date('2026-10-21T10:00Z') };
    const other = { ...event, raw: {}, externalUid: 'other' };
    expect(uniqueGardenEvents([event, copy, next, other])).toEqual([event, next, other]);
  });
  it('does not present weekly targets as daily obligations or count inactive weekdays', () => {
    const base = {
      id: 'habit',
      name: 'Hábito',
      icon: null,
      color: null,
      logs: [{ date: '2026-10-20', count: 1 }],
      days: ['tuesday'] as const,
    };
    const result = gardenHabits(
      [
        { ...base, goal: { period: 'day', timesPerPeriod: 1, targetCount: 1 } },
        { ...base, goal: { period: 'week', timesPerPeriod: 3, targetCount: 1 } },
        { ...base, days: ['monday'], goal: { period: 'day', timesPerPeriod: 1, targetCount: 1 } },
      ],
      '2026-10-20',
      '2026-10-19',
    );
    expect(result.today).toEqual({ done: 1, expected: 1 });
    expect(result.week).toEqual({ done: 2, expected: 5 });
  });
  it('counts active unique tasks and leaves missing historical activity unknown', () => {
    const now = new Date('2026-10-20T10:00Z');
    const task = { status: 'active', createdAt: new Date('2025-01-01'), completedAt: null };
    expect(
      gardenTagActivity(
        [
          { taskId: 'a', task },
          { taskId: 'a', task },
        ],
        now,
      ),
    ).toEqual({ active: 1, recent_activity: null });
    expect(
      gardenTagActivity(
        [{ taskId: 'a', task: { ...task, status: 'completed', completedAt: now } }],
        now,
      ),
    ).toEqual({ active: 0, recent_activity: true });
    expect(gardenTagActivity([], now).recent_activity).toBeNull();
  });
});
