import { entryLocalDays } from '@reflexionia/domain';
import { describe, expect, it, vi } from 'vitest';
import type { ExternalEventView } from '../calendar/ExternalEvent';
import type * as EventSpanModule from './event-span';
import { dayIndexFromSummary, paintColor } from './summary-days';
import { buildDayIndex, type YearIndexTask } from './year-index';

const ZONE = 'Europe/Madrid';

vi.mock('./event-span', async (importOriginal) => {
  const actual = await importOriginal<typeof EventSpanModule>();
  return {
    ...actual,
    eventDayRange: (event: ExternalEventView, timeZone?: string) =>
      actual.eventDayRange(event, timeZone ?? ZONE),
  };
});
const HEX = /^#[0-9a-fA-F]{3,8}$/;

const colors = new Map<string, string>([
  ['work', '#4772fa'],
  ['home', '#b45309'],
  ['other', '#0f766e'],
  ['bad', 'not-a-color'],
]);

function task(partial: Partial<YearIndexTask> & Pick<YearIndexTask, 'project_id'>): YearIndexTask {
  return { due_date: null, time_zone: ZONE, ...partial };
}

function event(
  id: string,
  startsAt: string,
  endsAt: string,
  extra: Partial<ExternalEventView> = {},
): ExternalEventView {
  return {
    id,
    title: id,
    starts_at: startsAt,
    ends_at: endsAt,
    is_all_day: false,
    time_zone: ZONE,
    ...extra,
  };
}

/** Summary cells from the domain day rule, with the server's `accent` token. */
function summaryCells(
  tasks: readonly YearIndexTask[],
  events: readonly ExternalEventView[],
): Record<string, { n: number; c: string[] }> {
  const days = new Map<string, { n: number; tasks: string[]; events: string[] }>();
  const slot = (key: string) => {
    const existing = days.get(key);
    if (existing !== undefined) return existing;
    const created = { n: 0, tasks: [] as string[], events: [] as string[] };
    days.set(key, created);
    return created;
  };
  for (const item of tasks) {
    const span = entryLocalDays(
      {
        kind: 'task',
        start: item.start_date ?? null,
        due: item.due_date,
        timeZone: item.time_zone ?? ZONE,
        allDay: true,
      },
      { profileTimeZone: ZONE },
    );
    if (span === null) continue;
    for (const key of span.days) {
      const day = slot(key);
      day.n += 1;
      if (day.tasks.length >= 3) continue;
      const raw = colors.get(item.project_id);
      const color = raw !== undefined && HEX.test(raw) ? raw : 'accent';
      if (!day.tasks.includes(color)) day.tasks.push(color);
    }
  }
  for (const item of events) {
    const span = entryLocalDays(
      {
        kind: 'event',
        start: item.starts_at,
        end: item.ends_at,
        timeZone: item.time_zone ?? ZONE,
        allDay: item.is_all_day,
      },
      { profileTimeZone: ZONE },
    );
    if (span === null) continue;
    const color =
      item.color !== undefined && item.color !== null && HEX.test(item.color)
        ? item.color
        : 'accent';
    for (const key of span.days) {
      const day = slot(key);
      day.n += 1;
      day.events.push(color);
    }
  }
  const cells: Record<string, { n: number; c: string[] }> = {};
  for (const [key, day] of days) {
    cells[key] = { n: day.n, c: [...day.tasks, ...day.events] };
  }
  return cells;
}

function expectParity(tasks: readonly YearIndexTask[], events: readonly ExternalEventView[]): void {
  const painted = dayIndexFromSummary(summaryCells(tasks, events));
  const local = buildDayIndex(tasks, events, colors, { fallbackZone: ZONE });
  const keys = new Set([...painted.keys(), ...local.keys()]);
  for (const key of keys) {
    expect(painted.get(key) ?? { count: 0, colors: [] }).toEqual(
      local.get(key) ?? { count: 0, colors: [] },
    );
  }
}

describe('CA-R1-2 summary days match buildDayIndex', () => {
  it('cambio de hora de marzo y de octubre', () => {
    const events = [
      event('spring', '2026-03-29T00:30:00Z', '2026-03-29T01:30:00Z', { color: '#111111' }),
      event('autumn', '2026-10-24T23:30:00Z', '2026-10-25T00:30:00Z', { color: '#222222' }),
      event('midnight', '2026-10-20T21:30:00Z', '2026-10-20T22:30:00Z', { color: '#333333' }),
    ];
    expectParity([], events);
    const painted = dayIndexFromSummary(summaryCells([], events));
    expect(painted.get('2026-03-29')?.colors).toEqual(['#111111']);
    expect(painted.get('2026-03-30')).toBeUndefined();
    expect(painted.get('2026-10-25')?.colors).toEqual(['#222222']);
    expect(painted.get('2026-10-24')).toBeUndefined();
    expect(painted.get('2026-10-20')?.colors).toEqual(['#333333']);
    expect(painted.get('2026-10-21')?.colors).toEqual(['#333333']);
  });

  it('eventos de varios días', () => {
    const trip = event('trip', '2026-03-09T23:00:00Z', '2026-03-11T23:00:00Z', {
      is_all_day: true,
      color: '#444444',
    });
    expectParity([], [trip]);
    const painted = dayIndexFromSummary(summaryCells([], [trip]));
    expect(painted.get('2026-03-10')?.colors).toEqual(['#444444']);
    expect(painted.get('2026-03-11')?.colors).toEqual(['#444444']);
    expect(painted.get('2026-03-12')).toBeUndefined();
  });

  it('tareas con inicio y sin vencimiento', () => {
    const tasks = [
      task({ project_id: 'home', start_date: '2026-04-09T07:00:00Z', due_date: null }),
      task({ project_id: 'bad', start_date: '2026-04-09T09:00:00Z', due_date: null }),
      task({
        project_id: 'work',
        start_date: '2026-03-02T08:00:00Z',
        due_date: '2026-03-06T17:00:00Z',
      }),
    ];
    expectParity(tasks, []);
    const painted = dayIndexFromSummary(summaryCells(tasks, []));
    expect(painted.get('2026-04-09')).toEqual({
      count: 2,
      colors: ['#b45309', 'var(--accent)'],
    });
    expect(painted.get('2026-03-02')?.count).toBe(1);
    expect(painted.get('2026-03-06')).toBeUndefined();
  });

  it('paints the server accent token as the local accent', () => {
    expect(paintColor('accent')).toBe('var(--accent)');
    expect(paintColor('#112233')).toBe('#112233');
  });
});
