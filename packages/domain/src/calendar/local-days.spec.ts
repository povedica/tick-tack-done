import { describe, expect, it } from 'vitest';
import { instantFromWall } from '../dates/zoned';
import { entryLocalDays } from './local-days';

const MADRID = 'Europe/Madrid';
const NEW_YORK = 'America/New_York';

function at(
  zone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  const iso = instantFromWall({ year, month, day, hour, minute, second: 0 }, zone);
  if (iso === null) {
    throw new Error(`missing wall time ${year}-${month}-${day} ${hour}:${minute} ${zone}`);
  }
  return iso;
}

describe('entryLocalDays E-perfil', () => {
  it('RF-604: a task with a different start and due marks only the start day', () => {
    const span = entryLocalDays(
      {
        kind: 'task',
        start: at(MADRID, 2026, 3, 2, 9, 0),
        due: at(MADRID, 2026, 3, 6, 18, 0),
        timeZone: MADRID,
        allDay: false,
      },
      { profileTimeZone: NEW_YORK },
    );
    expect(span?.days).toEqual(['2026-03-02']);
  });

  it('RF-604: a task captured at 9:00 Madrid stays on that day when the profile moves', () => {
    const span = entryLocalDays(
      {
        kind: 'task',
        start: at(MADRID, 2026, 3, 2, 9, 0),
        due: null,
        timeZone: MADRID,
        allDay: false,
      },
      { profileTimeZone: NEW_YORK },
    );
    expect(span).toEqual({ start: '2026-03-02', end: '2026-03-02', days: ['2026-03-02'] });
  });

  it('RF-604: a task just after Madrid midnight stays on the capture day in New York', () => {
    const span = entryLocalDays(
      {
        kind: 'task',
        start: at(MADRID, 2026, 3, 3, 0, 30),
        due: null,
        timeZone: MADRID,
        allDay: false,
      },
      { profileTimeZone: NEW_YORK },
    );
    expect(span?.days).toEqual(['2026-03-03']);
  });

  it('a task with no dates occupies no day', () => {
    expect(
      entryLocalDays(
        { kind: 'task', start: null, due: null, timeZone: MADRID, allDay: false },
        { profileTimeZone: MADRID },
      ),
    ).toBeNull();
  });

  it('an all-day task uses the civil date of its capture midnight', () => {
    const span = entryLocalDays(
      {
        kind: 'task',
        start: at(MADRID, 2026, 3, 2, 0, 0),
        due: at(MADRID, 2026, 3, 2, 0, 0),
        timeZone: MADRID,
        allDay: true,
      },
      { profileTimeZone: NEW_YORK },
    );
    expect(span?.days).toEqual(['2026-03-02']);
  });

  it('a timed event ending at the next midnight marks only the start day', () => {
    const span = entryLocalDays(
      {
        kind: 'event',
        start: at(MADRID, 2026, 3, 10, 22, 0),
        end: at(MADRID, 2026, 3, 11, 0, 0),
        timeZone: MADRID,
        allDay: false,
      },
      { profileTimeZone: MADRID },
    );
    expect(span?.days).toEqual(['2026-03-10']);
  });

  it('an all-day event treats DTEND as exclusive', () => {
    const span = entryLocalDays(
      {
        kind: 'event',
        start: at(MADRID, 2026, 3, 10, 0, 0),
        end: at(MADRID, 2026, 3, 12, 0, 0),
        timeZone: MADRID,
        allDay: true,
      },
      { profileTimeZone: NEW_YORK },
    );
    expect(span?.days).toEqual(['2026-03-10', '2026-03-11']);
  });

  it('a spring-forward interval stays on 29 March 2026 in Madrid', () => {
    const span = entryLocalDays(
      {
        kind: 'event',
        start: at(MADRID, 2026, 3, 29, 1, 30),
        end: at(MADRID, 2026, 3, 29, 3, 30),
        timeZone: MADRID,
        allDay: false,
      },
      { profileTimeZone: MADRID },
    );
    expect(span?.days).toEqual(['2026-03-29']);
  });

  it('an autumn interval of 01:30–02:30 stays on 25 October 2026', () => {
    const span = entryLocalDays(
      {
        kind: 'event',
        start: at(MADRID, 2026, 10, 25, 1, 30),
        end: at(MADRID, 2026, 10, 25, 2, 30),
        timeZone: MADRID,
        allDay: false,
      },
      { profileTimeZone: MADRID },
    );
    expect(span?.days).toEqual(['2026-10-25']);
  });

  it('a timed event crossing midnight occupies both civil days', () => {
    const span = entryLocalDays(
      {
        kind: 'event',
        start: at(MADRID, 2026, 3, 10, 23, 30),
        end: at(MADRID, 2026, 3, 11, 0, 30),
        timeZone: MADRID,
        allDay: false,
      },
      { profileTimeZone: MADRID },
    );
    expect(span?.days).toEqual(['2026-03-10', '2026-03-11']);
  });

  it('E-perfil: the same instant uses the profile day on every device', () => {
    const start = '2026-03-02T23:30:00.000Z';
    const madrid = entryLocalDays(
      { kind: 'event', start, end: null, timeZone: NEW_YORK, allDay: false },
      { profileTimeZone: MADRID },
    );
    const newYork = entryLocalDays(
      { kind: 'event', start, end: null, timeZone: MADRID, allDay: false },
      { profileTimeZone: NEW_YORK },
    );
    expect(madrid?.days).toEqual(['2026-03-03']);
    expect(newYork?.days).toEqual(['2026-03-02']);
  });
});
