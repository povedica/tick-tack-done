import { describe, expect, it } from 'vitest';
import { proposeReplan } from './replan';

const settings = { workDayStart: '09:00', workDayEnd: '10:00', defaultTaskDuration: 30 };

describe('proposeReplan', () => {
  it('RF-2670: a deadline of today stays and says why', () => {
    const [suggestion] = proposeReplan({
      today: '2026-10-20',
      timeZone: 'Europe/Madrid',
      settings,
      occupancy: {},
      candidates: [
        {
          id: 'today',
          title: 'Informe',
          priority: 'high',
          dueDate: '2026-10-20T16:00:00.000Z',
          timeZone: 'Europe/Madrid',
          durationMinutes: 30,
          isAllDay: false,
          eveningOnly: false,
        },
      ],
    });
    expect(suggestion?.decision).toBe('skip');
    expect(suggestion?.targetDate).toBe('2026-10-20');
    expect(suggestion?.reason).toContain('hoy');
  });

  it('RF-2670: when tomorrow is also full it picks the next business day with room', () => {
    const suggestion = proposeReplan({
      today: '2026-10-20',
      timeZone: 'Europe/Madrid',
      settings,
      occupancy: {
        '2026-10-21': {
          tasks: [
            {
              id: 'busy',
              durationMinutes: 60,
              isAllDay: false,
              eveningOnly: false,
              status: 'active',
              parentId: null,
            },
          ],
          events: [],
        },
      },
      candidates: [
        {
          id: 'move',
          title: 'Leer',
          priority: 'none',
          dueDate: '2026-10-25T10:00:00.000Z',
          timeZone: 'Europe/Madrid',
          durationMinutes: 30,
          isAllDay: false,
          eveningOnly: false,
        },
      ],
    });
    expect(suggestion[0]?.decision).toBe('plan_day');
    expect(suggestion[0]?.targetDate).toBe('2026-10-22');
    expect(suggestion[0]?.reason).toContain('no cabe');
  });
});
