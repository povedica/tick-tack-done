import { describe, expect, it } from 'vitest';
import {
  buildDailyDigest,
  formatDailyDigest,
  titleForEmail,
  titleWithoutKnownTags,
} from './digest';

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

  it('strips TaskTag hashtags from the email title and keeps unknown ones', () => {
    expect(titleWithoutKnownTags('Llamar #casa #review', [{ name: 'casa' }])).toBe(
      'Llamar #review',
    );
    expect(titleWithoutKnownTags('#Casa presupuesto', [{ name: 'casa' }])).toBe('presupuesto');
    expect(titleWithoutKnownTags('Visitar #casamiento', [{ name: 'casa' }])).toBe(
      'Visitar #casamiento',
    );
    expect(titleWithoutKnownTags('Nota #c++', [{ name: 'c++' }])).toBe('Nota');
    expect(titleForEmail('#casa', [{ name: 'casa' }])).toBe('#casa');
    expect(titleForEmail('   ', [{ name: 'casa' }])).toBe('');
  });

  it('caps the email model at 20 and counts the rest', () => {
    const tasks = Array.from({ length: 21 }, (_, index) => ({
      id: `t-${String(index)}`,
      title: `Hoy ${String(index)}`,
      dueDate: '2026-10-19T16:00:00.000Z',
      isAllDay: false,
      timeZone: zone,
      priority: 'none' as const,
      listName: 'Inbox',
      tags: [{ name: 'review' }],
    }));
    const model = buildDailyDigest({ now: morning, fireAt: morning, tasks });
    expect(model.today).toHaveLength(20);
    expect(model.overdue).toHaveLength(0);
    expect(model.todayCount).toBe(21);
    expect(model.omitted).toBe(1);
    expect(
      buildDailyDigest({ now: morning, fireAt: morning, tasks: tasks.slice(0, 20), extra: 5 })
        .omitted,
    ).toBe(5);
    expect(model.today[0]?.title).toBe('Hoy 0');
    expect(formatDailyDigest({ now: morning, fireAt: morning, tasks })).toContain('Hoy 20');
  });

  it('lists newest overdue first and all-day tasks before timed ones', () => {
    const model = buildDailyDigest({
      now: morning,
      fireAt: morning,
      tasks: [
        {
          id: 'late',
          title: 'Vieja #casa',
          dueDate: '2026-10-17T08:00:00.000Z',
          isAllDay: false,
          timeZone: zone,
          priority: 'high',
          listName: 'Casa',
          tags: [{ name: 'casa' }, { name: '  ' }],
        },
        {
          id: 'newer',
          title: 'Ayer',
          dueDate: '2026-10-18T08:00:00.000Z',
          isAllDay: false,
          timeZone: zone,
        },
        {
          id: 'timed',
          title: 'Con hora',
          dueDate: '2026-10-19T14:00:00.000Z',
          startDate: '2026-10-19T12:00:00.000Z',
          isAllDay: false,
          timeZone: zone,
        },
        {
          id: 'day',
          title: 'Día entero',
          dueDate: '2026-10-18T22:00:00.000Z',
          isAllDay: true,
          timeZone: zone,
        },
      ],
    });
    expect(model.overdue.map((item) => item.id)).toEqual(['newer', 'late']);
    expect(model.overdue[1]?.title).toBe('Vieja');
    expect(model.overdue[1]?.tags).toEqual([{ name: 'casa' }]);
    expect(model.overdue[1]?.priority).toBe('high');
    expect(model.today.map((item) => item.id)).toEqual(['day', 'timed']);
    expect(model.omitted).toBe(0);
  });
});
