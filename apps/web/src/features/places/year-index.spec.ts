import { calendarDateKey } from '@reflexionia/domain';
import { describe, expect, it, vi } from 'vitest';
import type { ExternalEventView } from '../calendar/ExternalEvent';
import type * as EventSpanModule from './event-span';
import { eventDayRange } from './event-span';
import { localDateParam, tasksOnCell } from './month';
import { buildDayIndex, type YearIndexTask } from './year-index';

vi.mock('./event-span', async (importOriginal) => {
  const actual = await importOriginal<typeof EventSpanModule>();
  return {
    ...actual,
    eventDayRange: (event: ExternalEventView, timeZone?: string) =>
      actual.eventDayRange(event, timeZone ?? 'Europe/Madrid'),
  };
});

const TASK_MARK_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const ZONE = 'Europe/Madrid';

function task(partial: Partial<YearIndexTask> & Pick<YearIndexTask, 'project_id'>): YearIndexTask {
  return {
    due_date: null,
    time_zone: ZONE,
    ...partial,
  };
}

function timed(
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

function legacy(
  tasks: readonly YearIndexTask[],
  events: readonly ExternalEventView[],
  colors: ReadonlyMap<string, string>,
  day: Date,
) {
  const key = localDateParam(day);
  const seen = new Set<string>();
  const taskColors: string[] = [];
  for (const item of tasksOnCell(tasks, day)) {
    const raw = colors.get(item.project_id);
    const color = raw !== undefined && TASK_MARK_COLOR.test(raw) ? raw : 'var(--accent)';
    seen.add(color);
    if (!taskColors.includes(color)) taskColors.push(color);
    if (seen.size === 3) break;
  }
  const cellEvents = events.filter((event) => {
    const range = eventDayRange(event);
    return key >= range.start && key <= range.end;
  });
  return {
    count: tasksOnCell(tasks, day).length + cellEvents.length,
    colors: [...taskColors, ...cellEvents.map((event) => event.color ?? 'var(--accent)')],
  };
}

describe('buildDayIndex', () => {
  const colors = new Map<string, string>([
    ['work', '#4772fa'],
    ['home', '#b45309'],
    ['other', '#0f766e'],
    ['bad', 'not-a-color'],
    ['fourth', '#ff00aa'],
  ]);

  const tasks: YearIndexTask[] = [
    task({
      project_id: 'work',
      start_date: '2026-03-02T08:00:00Z',
      due_date: '2026-03-06T17:00:00Z',
    }),
    task({ project_id: 'home', start_date: '2026-04-09T07:00:00Z', due_date: null }),
    task({ project_id: 'other', due_date: '2026-03-02T12:00:00Z' }),
    task({ project_id: 'bad', due_date: '2026-03-02T15:00:00Z' }),
    task({ project_id: 'fourth', due_date: '2026-03-02T18:00:00Z' }),
    task({ project_id: 'missing', due_date: '2026-03-02T19:00:00Z' }),
  ];
  const events: ExternalEventView[] = [
    timed('spring', '2026-03-29T00:30:00Z', '2026-03-29T01:30:00Z', { color: '#111111' }),
    timed('autumn', '2026-10-24T23:30:00Z', '2026-10-25T00:30:00Z', { color: '#222222' }),
    timed('midnight', '2026-10-20T21:30:00Z', '2026-10-20T22:30:00Z', { color: '#333333' }),
    {
      id: 'trip',
      title: 'Viaje',
      starts_at: '2026-03-09T23:00:00Z',
      ends_at: '2026-03-11T23:00:00Z',
      is_all_day: true,
      time_zone: ZONE,
      color: '#444444',
    },
  ];

  it('marks a Monday–Friday task on the effective start day only', () => {
    const index = buildDayIndex(tasks, [], colors, { fallbackZone: ZONE });
    expect(index.get('2026-03-02')?.count).toBeGreaterThan(0);
    expect(index.get('2026-03-03')).toBeUndefined();
    expect(index.get('2026-03-04')).toBeUndefined();
    expect(index.get('2026-03-05')).toBeUndefined();
    expect(index.get('2026-03-06')).toBeUndefined();
    expect(calendarDateKey('2026-03-02T08:00:00Z', ZONE)).toBe('2026-03-02');
  });

  it('keeps a start-only task, DST days, midnight crossings and exclusive all-day ends', () => {
    const index = buildDayIndex(tasks, events, colors, { fallbackZone: ZONE });
    expect(index.get('2026-04-09')?.count).toBe(1);
    expect(index.get('2026-03-29')?.colors).toEqual(['#111111']);
    expect(index.get('2026-03-30')).toBeUndefined();
    expect(index.get('2026-10-25')?.colors).toEqual(['#222222']);
    expect(index.get('2026-10-24')).toBeUndefined();
    expect(index.get('2026-10-20')?.colors).toEqual(['#333333']);
    expect(index.get('2026-10-21')?.colors).toEqual(['#333333']);
    expect(index.get('2026-03-10')?.colors).toEqual(['#444444']);
    expect(index.get('2026-03-11')?.colors).toEqual(['#444444']);
    expect(index.get('2026-03-12')).toBeUndefined();
  });

  it('matches tasksOnCell and eventsOnDay, with at most three task colors before event dots', () => {
    const index = buildDayIndex(tasks, events, colors, { fallbackZone: ZONE });
    const marchSecond = index.get('2026-03-02');
    expect(marchSecond?.colors.slice(0, 3)).toEqual(['#4772fa', '#0f766e', 'var(--accent)']);
    expect(marchSecond?.colors).toHaveLength(3);
    expect(marchSecond?.count).toBe(5);
    for (let month = 0; month < 12; month += 1) {
      for (let date = 1; date <= 31; date += 1) {
        const day = new Date(2026, month, date);
        if (day.getMonth() !== month) continue;
        const expected = legacy(tasks, events, colors, day);
        const actual = index.get(localDateParam(day)) ?? { count: 0, colors: [] };
        expect(actual).toEqual(expected);
      }
    }
  });

  it('indexes 5_000 tasks and 5_000 events in under 100 ms', () => {
    const manyTasks: YearIndexTask[] = Array.from({ length: 5_000 }, (_, index) =>
      task({
        project_id: index % 2 === 0 ? 'work' : 'home',
        due_date: new Date(Date.UTC(2026, 0, 1 + (index % 300), 8, 0, 0)).toISOString(),
      }),
    );
    const manyEvents: ExternalEventView[] = Array.from({ length: 5_000 }, (_, index) =>
      timed(
        `e-${String(index)}`,
        new Date(Date.UTC(2026, 0, 1 + (index % 300), 9, 0, 0)).toISOString(),
        new Date(Date.UTC(2026, 0, 1 + (index % 300), 10, 0, 0)).toISOString(),
        { color: '#123456' },
      ),
    );
    buildDayIndex(manyTasks.slice(0, 1), manyEvents.slice(0, 1), colors, { fallbackZone: ZONE });
    const started = performance.now();
    const index = buildDayIndex(manyTasks, manyEvents, colors, { fallbackZone: ZONE });
    const elapsed = performance.now() - started;
    expect(index.size).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100);
  });
});
