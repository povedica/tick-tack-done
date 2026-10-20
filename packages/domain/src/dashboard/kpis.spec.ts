import { describe, expect, it } from 'vitest';
import { dashboardSnapshot, productivityPanel, weeklyNarrative, overdueAgeGroups } from './kpis';

const now = '2026-10-18T12:00:00.000Z';

describe('dashboard', () => {
  it('groups overdue ages without overlap at days 0, 6, 7, 30 and 31', () => {
    const groups = overdueAgeGroups(
      [0, 6, 7, 30, 31].map((days_overdue) => ({ list_id: 'one', name: 'One', days_overdue })),
    );
    expect(groups).toEqual([
      { list_id: 'one', name: 'One', total: 5, under_7: 2, days_7_30: 2, over_30: 1 },
    ]);
    expect(
      groups.reduce((sum, item) => sum + item.under_7 + item.days_7_30 + item.over_30, 0),
    ).toBe(5);
  });
  it('orders the worst lists first with stable name ties and a no-list bucket', () => {
    const groups = overdueAgeGroups([
      { list_id: 'a', name: 'Alfa', days_overdue: 7 },
      { list_id: 'b', name: 'Beta', days_overdue: 31 },
      { list_id: 'z', name: 'Zeta', days_overdue: 7 },
      { list_id: null, name: '', days_overdue: 0 },
    ]);
    expect(groups.map((item) => item.name)).toEqual(['Beta', 'Alfa', 'Zeta', 'Sin lista']);
  });
  it('counts today in the account time zone across UTC midnight', () => {
    const snapshot = dashboardSnapshot(
      [
        {
          createdAt: '2026-10-19T12:00:00Z',
          completedAt: '2026-10-19T23:30:00Z',
          dueDate: null,
          status: 'completed',
          listId: 'one',
          listName: 'One',
          tagNames: [],
        },
      ],
      [],
      '2026-10-20T01:00:00Z',
      'Europe/Madrid',
    );
    expect(snapshot.completed_today).toBe(1);
    expect(
      dashboardSnapshot(
        [
          {
            createdAt: '2026-10-19T12:00:00Z',
            completedAt: '2026-10-19T23:30:00Z',
            dueDate: null,
            status: 'completed',
            listId: 'one',
            listName: 'One',
            tagNames: [],
          },
        ],
        [],
        '2026-10-20T01:00:00Z',
        'UTC',
      ).completed_today,
    ).toBe(0);
  });
  it('RF-2102: counts completed, overdue, the next week and habit percent', () => {
    const snapshot = dashboardSnapshot(
      [
        {
          createdAt: '2026-10-17T10:00:00.000Z',
          completedAt: '2026-10-18T09:00:00.000Z',
          dueDate: '2026-10-18T08:00:00.000Z',
          status: 'completed',
          listId: 'list-1',
          listName: 'Trabajo',
          tagNames: ['casa'],
        },
        {
          createdAt: '2026-10-18T08:00:00.000Z',
          completedAt: null,
          dueDate: '2026-10-17T08:00:00.000Z',
          status: 'active',
          listId: 'list-1',
          listName: 'Trabajo',
          tagNames: ['casa'],
        },
        {
          createdAt: '2026-10-01T08:00:00.000Z',
          completedAt: '2026-10-10T08:00:00.000Z',
          dueDate: '2026-10-20T08:00:00.000Z',
          status: 'completed',
          listId: 'list-2',
          listName: 'Casa',
          tagNames: [],
        },
        {
          createdAt: '2026-10-18T07:00:00.000Z',
          completedAt: null,
          dueDate: '2026-10-19T08:00:00.000Z',
          status: 'active',
          listId: 'list-2',
          listName: 'Casa',
          tagNames: [],
        },
      ],
      [{ name: 'Agua', targetCount: 1, checks: [{ date: '2026-10-18', count: 1 }] }],
      now,
    );
    expect(snapshot.completed_today).toBe(1);
    expect(snapshot.overdue).toBe(1);
    expect(snapshot.next_7_days).toBe(1);
    expect(snapshot.habit_percent).toBe(100);
    expect(snapshot.by_list[0]?.active).toBeGreaterThan(0);
    expect(productivityPanel({ snapshot, focusMinutes: 0 }).snapshot.net).toBe(snapshot.net);
  });

  it('RF-2201: an honest weak week says so, and the other tones do not flatter with the same facts', () => {
    const snapshot = dashboardSnapshot(
      [
        {
          createdAt: '2026-10-18T08:00:00.000Z',
          completedAt: null,
          dueDate: '2026-10-16T08:00:00.000Z',
          status: 'active',
          listId: 'list-1',
          listName: 'Trabajo',
          tagNames: [],
        },
      ],
      [{ name: 'Agua', targetCount: 8, checks: [] }],
      now,
    );
    const honest = weeklyNarrative(snapshot, 'honesto', null);
    expect(honest.summary.startsWith('La semana fue floja.')).toBe(true);
    expect(honest.observations.length).toBeGreaterThan(0);
    expect(weeklyNarrative(snapshot, 'neutro', 25).summary.startsWith('Completadas')).toBe(true);
    expect(weeklyNarrative(snapshot, 'motivador', null).summary).toContain('huecos');
  });

  it('RF-2201: a solid week is recognised', () => {
    const snapshot = dashboardSnapshot(
      [
        {
          createdAt: '2026-10-12T08:00:00.000Z',
          completedAt: '2026-10-17T08:00:00.000Z',
          dueDate: null,
          status: 'completed',
          listId: 'list-1',
          listName: 'Trabajo',
          tagNames: [],
        },
      ],
      [],
      now,
    );
    expect(
      weeklyNarrative(snapshot, 'honesto', 10).summary.startsWith('La semana fue sólida.'),
    ).toBe(true);
    expect(weeklyNarrative(snapshot, 'motivador', null).weak).toBe(false);
  });
});
