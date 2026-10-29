import { describe, expect, it } from 'vitest';
import type { ExternalEventView } from '../ExternalEvent';
import { buildCalendarDayIndex, eventsForDay, tasksForDay } from './day-index';

function task(start: string | null, due: string | null, zone = 'Europe/Madrid') {
  return { start_date: start, due_date: due, time_zone: zone, project_id: 'inbox' };
}

function event(
  partial: Partial<ExternalEventView> & Pick<ExternalEventView, 'id' | 'starts_at'>,
): ExternalEventView {
  return {
    title: partial.id,
    ends_at: null,
    is_all_day: false,
    ...partial,
  };
}

describe('buildCalendarDayIndex', () => {
  it('places a task on its effective day and keeps a spanning event on each covered day', () => {
    const index = buildCalendarDayIndex(
      [task('2026-01-05T08:00:00.000Z', '2026-01-09T08:00:00.000Z')],
      [
        event({
          id: 'span',
          starts_at: '2026-01-05',
          ends_at: '2026-01-08',
          is_all_day: true,
          time_zone: 'Europe/Madrid',
        }),
      ],
    );
    expect(tasksForDay(index, '2026-01-05')).toHaveLength(1);
    expect(tasksForDay(index, '2026-01-09')).toHaveLength(0);
    expect(eventsForDay(index, '2026-01-05').map((item) => item.id)).toEqual(['span']);
    expect(eventsForDay(index, '2026-01-07').map((item) => item.id)).toEqual(['span']);
    expect(eventsForDay(index, '2026-01-08').map((item) => item.id)).toEqual(['span']);
    expect(eventsForDay(index, '2026-01-09')).toEqual([]);
  });
});
