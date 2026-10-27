import { describe, expect, it } from 'vitest';
import { isOverdue, plannedForLater, snoozeDue } from './schedule';
import { wallClock } from './zoned';

const MADRID = 'Europe/Madrid';
const NOW = '2026-10-17T13:00:00.000Z';

describe('dates', () => {
  it('RF-603: a timed task is overdue once its instant has passed', () => {
    expect(
      isOverdue({
        status: 'active',
        dueDate: '2026-10-17T12:00:00.000Z',
        isAllDay: false,
        timeZone: MADRID,
        now: NOW,
      }),
    ).toBe(true);
    expect(
      isOverdue({
        status: 'active',
        dueDate: '2026-10-17T18:00:00.000Z',
        isAllDay: false,
        timeZone: MADRID,
        now: NOW,
      }),
    ).toBe(false);
    expect(
      isOverdue({
        status: 'completed',
        dueDate: '2026-10-17T12:00:00.000Z',
        isAllDay: false,
        timeZone: MADRID,
        now: NOW,
      }),
    ).toBe(false);
  });

  it('RF-603: an all-day task stays current through its local date', () => {
    expect(
      isOverdue({
        status: 'active',
        dueDate: '2026-10-17T22:00:00.000Z',
        isAllDay: true,
        timeZone: MADRID,
        now: NOW,
      }),
    ).toBe(false);
    expect(
      isOverdue({
        status: 'active',
        dueDate: '2026-10-15T22:00:00.000Z',
        isAllDay: true,
        timeZone: MADRID,
        now: NOW,
      }),
    ).toBe(true);
  });

  it('RF-604: the capture zone keeps 09:00 even when read from another zone', () => {
    const due = '2026-10-19T07:00:00.000Z';
    expect(wallClock(due, MADRID)).toMatchObject({ hour: 9, minute: 0 });
    expect(wallClock(due, 'America/New_York')?.hour).not.toBe(9);
  });

  it('RF-605: snooze to tomorrow, next week or a chosen date keeps the clock time', () => {
    const base = {
      dueDate: '2026-10-19T07:00:00.000Z',
      startDate: '2026-10-19T06:00:00.000Z',
      isAllDay: false,
      timeZone: MADRID,
      now: NOW,
    };
    expect(snoozeDue({ ...base, preset: 'tomorrow' })).toEqual({
      ok: true,
      dates: {
        dueDate: '2026-10-18T07:00:00.000Z',
        startDate: '2026-10-18T06:00:00.000Z',
      },
    });
    expect(snoozeDue({ ...base, preset: 'next_week' })).toEqual({
      ok: true,
      dates: {
        dueDate: '2026-10-24T07:00:00.000Z',
        startDate: '2026-10-24T06:00:00.000Z',
      },
    });
    expect(snoozeDue({ ...base, preset: 'date', date: '2026-11-02T15:30:00.000Z' })).toEqual({
      ok: true,
      dates: {
        dueDate: '2026-11-02T15:30:00.000Z',
        startDate: '2026-11-02T14:30:00.000Z',
      },
    });
  });

  it('RF-605: an all-day snooze lands at local midnight, and a bare date preset needs a date', () => {
    expect(
      snoozeDue({
        dueDate: null,
        startDate: null,
        isAllDay: true,
        timeZone: MADRID,
        now: NOW,
        preset: 'tomorrow',
      }),
    ).toEqual({
      ok: true,
      dates: { dueDate: '2026-10-17T22:00:00.000Z', startDate: null },
    });
    expect(
      snoozeDue({
        dueDate: null,
        startDate: null,
        isAllDay: false,
        timeZone: MADRID,
        now: NOW,
        preset: 'date',
      }),
    ).toEqual({ ok: false, reason: 'date_required' });
    expect(
      snoozeDue({
        dueDate: null,
        startDate: null,
        isAllDay: false,
        timeZone: 'Mars/Olympus',
        now: NOW,
        preset: 'tomorrow',
      }),
    ).toEqual({ ok: false, reason: 'invalid_zone' });
    expect(
      snoozeDue({
        dueDate: 'not-a-date',
        startDate: null,
        isAllDay: false,
        timeZone: MADRID,
        now: NOW,
        preset: 'tomorrow',
      }),
    ).toEqual({ ok: false, reason: 'invalid_date' });
  });

  it('RF-603: a start on a later civil day is planned, not overdue', () => {
    const viewed = '2026-10-27T11:00:00.000Z';
    const pastDue = '2026-10-24T22:00:00.000Z';
    const laterStart = '2026-10-28T23:00:00.000Z';
    const todayStart = '2026-10-26T23:00:00.000Z';
    expect(
      isOverdue({
        status: 'active',
        dueDate: pastDue,
        startDate: laterStart,
        isAllDay: true,
        timeZone: MADRID,
        now: viewed,
      }),
    ).toBe(false);
    expect(plannedForLater({ startDate: laterStart, timeZone: MADRID }, viewed)).toBe(true);
    expect(
      isOverdue({
        status: 'active',
        dueDate: pastDue,
        startDate: todayStart,
        isAllDay: true,
        timeZone: MADRID,
        now: viewed,
      }),
    ).toBe(true);
    expect(
      isOverdue({
        status: 'active',
        dueDate: pastDue,
        isAllDay: true,
        timeZone: MADRID,
        now: viewed,
      }),
    ).toBe(true);
    expect(
      isOverdue({
        status: 'active',
        dueDate: pastDue,
        startDate: laterStart,
        isAllDay: true,
        timeZone: MADRID,
        now: '2026-10-29T11:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('RF-604: the 25 October clock change keeps the civil day', () => {
    const afterFallback = '2026-10-25T01:30:00.000Z';
    expect(
      isOverdue({
        status: 'active',
        dueDate: '2026-10-23T22:00:00.000Z',
        isAllDay: true,
        timeZone: MADRID,
        now: afterFallback,
      }),
    ).toBe(true);
    expect(
      isOverdue({
        status: 'active',
        dueDate: '2026-10-24T22:00:00.000Z',
        isAllDay: true,
        timeZone: MADRID,
        now: afterFallback,
      }),
    ).toBe(false);
    expect(
      isOverdue({
        status: 'active',
        dueDate: '2026-10-23T22:00:00.000Z',
        startDate: '2026-10-25T23:00:00.000Z',
        isAllDay: true,
        timeZone: MADRID,
        now: afterFallback,
      }),
    ).toBe(false);
  });
});
