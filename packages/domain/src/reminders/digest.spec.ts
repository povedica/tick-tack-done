import { describe, expect, it } from 'vitest';
import { formatDailyDigest } from './digest';

const zone = 'Europe/Madrid';
const morning = '2026-10-19T05:00:00.000Z';

describe('daily digest', () => {
  it('NT-14: lists overdue tasks and tasks due that morning', () => {
    expect(
      formatDailyDigest({
        now: morning,
        fireAt: morning,
        tasks: [
          {
            title: 'Atrasada',
            dueDate: '2026-10-18T08:00:00.000Z',
            isAllDay: false,
            timeZone: zone,
          },
          {
            title: 'Hoy mismo',
            dueDate: '2026-10-19T14:00:00.000Z',
            isAllDay: false,
            timeZone: zone,
          },
          {
            title: 'Mañana',
            dueDate: '2026-10-20T08:00:00.000Z',
            isAllDay: false,
            timeZone: zone,
          },
          {
            title: 'Planificada',
            dueDate: '2026-10-18T08:00:00.000Z',
            startDate: '2026-10-21T08:00:00.000Z',
            isAllDay: false,
            timeZone: zone,
          },
        ],
      }),
    ).toBe('Vencidas\n- Atrasada\n\nHoy\n- Hoy mismo');
  });

  it('NT-14: an empty morning stays a single sentence', () => {
    expect(formatDailyDigest({ now: morning, fireAt: morning, tasks: [] })).toBe(
      'No hay tareas con fecha para hoy.',
    );
  });
});
