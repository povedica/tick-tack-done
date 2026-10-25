import { describe, expect, it } from 'vitest';
import { dayLoad, formatDayLoadLine, formatMinutes } from './day-load';

const ZONE = 'Europe/Madrid';
const DATE = '2026-10-20';

function task(partial: Partial<Parameters<typeof dayLoad>[0]['tasks'][number]> & { id: string }) {
  return {
    durationMinutes: 30,
    isAllDay: false,
    eveningOnly: false,
    status: 'active',
    parentId: null,
    ...partial,
  };
}

describe('dayLoad', () => {
  it('RF-2640: counts default duration and ignores evening, someday, children and all-day events', () => {
    const result = dayLoad({
      date: DATE,
      timeZone: ZONE,
      settings: { workDayStart: '09:00', workDayEnd: '18:00', defaultTaskDuration: 30 },
      tasks: [
        task({ id: 'a', durationMinutes: 45 }),
        task({ id: 'b', durationMinutes: null }),
        task({ id: 'night', eveningOnly: true, durationMinutes: 60 }),
        task({ id: 'later', isSomeday: true, durationMinutes: 60 }),
        task({ id: 'child', parentId: 'a', durationMinutes: 60 }),
        task({ id: 'done', status: 'completed', durationMinutes: 60 }),
      ],
      events: [
        {
          id: 'all',
          startsAt: '2026-10-20T00:00:00.000Z',
          endsAt: '2026-10-21T00:00:00.000Z',
          isAllDay: true,
        },
      ],
    });
    expect(result.availableMinutes).toBe(540);
    expect(result.taskMinutes).toBe(75);
    expect(result.eventMinutes).toBe(0);
    expect(result.unestimatedTaskIds).toEqual(['b']);
    expect(result.status).toBe('ok');
  });

  it('RF-2640: an event that starts before the workday counts only the overlap', () => {
    const result = dayLoad({
      date: DATE,
      timeZone: ZONE,
      settings: { workDayStart: '09:00', workDayEnd: '18:00', defaultTaskDuration: 30 },
      tasks: [],
      events: [
        {
          id: 'early',
          startsAt: '2026-10-20T06:00:00.000Z',
          endsAt: '2026-10-20T08:00:00.000Z',
          isAllDay: false,
        },
      ],
    });
    expect(result.eventMinutes).toBe(60);
  });

  it('RF-2646: a null workday disables the projection', () => {
    const result = dayLoad({
      date: DATE,
      timeZone: ZONE,
      settings: { workDayStart: null, workDayEnd: null, defaultTaskDuration: 30 },
      tasks: [task({ id: 'a', durationMinutes: 600 })],
      events: [],
    });
    expect(result.availableMinutes).toBeNull();
    expect(result.status).toBe('ok');
    expect(result.ratio).toBeNull();
  });

  it('RF-2640: 0.85 is ok, 1 is tight, above 1 is overload', () => {
    const settings = { workDayStart: '09:00', workDayEnd: '10:00', defaultTaskDuration: 30 };
    expect(
      dayLoad({
        date: DATE,
        timeZone: ZONE,
        settings,
        tasks: [task({ id: 'a', durationMinutes: 51 })],
        events: [],
      }).status,
    ).toBe('ok');
    expect(
      dayLoad({
        date: DATE,
        timeZone: ZONE,
        settings,
        tasks: [task({ id: 'a', durationMinutes: 60 })],
        events: [],
      }).status,
    ).toBe('tight');
    expect(
      dayLoad({
        date: DATE,
        timeZone: ZONE,
        settings,
        tasks: [task({ id: 'a', durationMinutes: 61 })],
        events: [],
      }).status,
    ).toBe('overload');
  });

  it('RF-2644: formats the digest line', () => {
    expect(
      formatDayLoadLine({
        taskCount: 4,
        taskMinutes: 210,
        eventMinutes: 120,
        availableMinutes: 540,
      }),
    ).toBe('Hoy: 4 tareas (~3 h 30 min) + 2 h de agenda, de 9 h de jornada.');
    expect(formatMinutes(45)).toBe('45 min');
  });
});

describe('F-AC-1 multi-day load', () => {
  it('RF-2640: clips each of seven days to the configured nine-hour workday in the profile zone', () => {
    for (let d = 20; d <= 26; d += 1) {
      const load = dayLoad({
        date: `2026-10-${d}`,
        timeZone: ZONE,
        settings: {
          workDayStart: '09:00',
          workDayEnd: '18:00',
          defaultTaskDuration: 30,
          workDays: [0, 1, 2, 3, 4, 5, 6],
        },
        tasks: [
          task({
            id: 'week',
            startDate: '2026-10-20T08:00:00Z',
            dueDate: '2026-10-26T12:00:00Z',
            durationMinutes: 8820,
          }),
        ],
        events: [],
      });
      expect(load.taskMinutes).toBeLessThanOrEqual(540);
      expect(load.taskMinutes).toBeGreaterThan(0);
    }
  });
  it('RF-2640: all-day ranges use the default estimate; a configured day off has no work window', () => {
    const input = {
      date: '2026-10-24',
      timeZone: ZONE,
      settings: { workDayStart: '09:00', workDayEnd: '18:00', defaultTaskDuration: 30 },
      tasks: [
        task({
          id: 'week',
          isAllDay: true,
          startDate: '2026-10-20T00:00:00Z',
          dueDate: '2026-10-26T00:00:00Z',
          durationMinutes: 8820,
        }),
      ],
      events: [],
    };
    expect(dayLoad(input).taskMinutes).toBe(30);
    expect(dayLoad(input).availableMinutes).toBeNull();
  });
});
