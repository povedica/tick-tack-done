import { describe, expect, it } from 'vitest';
import { nextOccurrence, occurrencesBetween } from './index';
import {
  buildRepeatRule,
  canonicalizeRepeatRule,
  describeRepeatRule,
  excludeOccurrence,
  parseRepeatRule,
} from './rule';

const MADRID = 'Europe/Madrid';

function due(iso: string) {
  return {
    repeatFrom: 'due_date' as const,
    dueDate: iso,
    startDate: null,
    completedAt: null,
    timeZone: MADRID,
    isAllDay: false,
    occurrenceIndex: null,
  };
}

describe('recurrence', () => {
  it('RF-701: daily, weekly days, first Monday, yearly, interval, until and count', () => {
    expect(
      nextOccurrence({ ...due('2026-10-19T07:00:00.000Z'), repeatRule: 'RRULE:FREQ=DAILY' }),
    ).toEqual({
      ok: true,
      occurrence: { dueDate: '2026-10-20T07:00:00.000Z', startDate: null },
    });

    expect(
      nextOccurrence({
        ...due('2026-10-19T07:00:00.000Z'),
        repeatRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE',
      }),
    ).toEqual({
      ok: true,
      occurrence: { dueDate: '2026-10-21T07:00:00.000Z', startDate: null },
    });

    expect(
      nextOccurrence({
        ...due('2026-01-05T08:00:00.000Z'),
        repeatRule: 'RRULE:FREQ=MONTHLY;BYDAY=1MO',
      }),
    ).toEqual({
      ok: true,
      occurrence: { dueDate: '2026-02-02T08:00:00.000Z', startDate: null },
    });

    expect(
      nextOccurrence({
        ...due('2026-10-19T07:00:00.000Z'),
        repeatRule: 'RRULE:FREQ=DAILY;INTERVAL=3',
      }),
    ).toEqual({
      ok: true,
      occurrence: { dueDate: '2026-10-22T07:00:00.000Z', startDate: null },
    });

    expect(
      nextOccurrence({
        ...due('2026-10-19T07:00:00.000Z'),
        repeatRule: 'RRULE:FREQ=DAILY;UNTIL=20261019T070000Z',
      }),
    ).toEqual({ ok: true, occurrence: null });

    expect(
      nextOccurrence({
        ...due('2026-10-19T07:00:00.000Z'),
        repeatRule: 'RRULE:FREQ=DAILY;COUNT=1',
      }),
    ).toEqual({ ok: true, occurrence: null });

    expect(
      nextOccurrence({
        ...due('2026-10-19T07:00:00.000Z'),
        repeatRule: 'RRULE:NOT-A-RULE',
      }),
    ).toEqual({ ok: false, reason: 'invalid_rule' });
    expect(
      nextOccurrence({
        ...due('2026-10-19T07:00:00.000Z'),
        repeatRule: 'RRULE:FREQ=DAILY',
        timeZone: 'Not/AZone',
      }),
    ).toEqual({ ok: false, reason: 'invalid_zone' });
  });

  it('RF-702: a structured draft builds an RRULE and a Spanish label', () => {
    expect(
      buildRepeatRule({
        freq: 'monthly',
        monthWeek: { setpos: 1, weekday: 'MO' },
      }),
    ).toEqual({ ok: true, rule: 'RRULE:FREQ=MONTHLY;BYDAY=1MO' });
    expect(describeRepeatRule('RRULE:FREQ=MONTHLY;BYDAY=1MO')).toBe('El primer lunes de cada mes');
    expect(describeRepeatRule('RRULE:FREQ=MONTHLY;BYMONTHDAY=31')).toBe('El día 31 de cada mes');
    expect(describeRepeatRule('RRULE:FREQ=DAILY;INTERVAL=3;COUNT=10')).toBe(
      'Cada 3 días, 10 veces',
    );
    expect(buildRepeatRule({ freq: 'daily', interval: 0 })).toEqual({
      ok: false,
      reason: 'invalid_rule',
    });
  });

  it('RF-703: completion_date steps from the completion, due_date steps the original grid', () => {
    const rule = 'RRULE:FREQ=DAILY;INTERVAL=3';
    const fromDue = nextOccurrence({
      ...due('2026-10-19T07:00:00.000Z'),
      repeatRule: rule,
      repeatFrom: 'due_date',
      completedAt: '2026-10-21T13:00:00.000Z',
    });
    const fromDone = nextOccurrence({
      ...due('2026-10-19T07:00:00.000Z'),
      repeatRule: rule,
      repeatFrom: 'completion_date',
      completedAt: '2026-10-21T13:00:00.000Z',
      occurrenceIndex: 1,
    });
    expect(fromDue).toEqual({
      ok: true,
      occurrence: { dueDate: '2026-10-22T07:00:00.000Z', startDate: null },
    });
    expect(fromDone).toEqual({
      ok: true,
      occurrence: { dueDate: '2026-10-24T07:00:00.000Z', startDate: null },
    });
  });

  it('RF-704: the range lists theoretical occurrences and does not invent a stored row', () => {
    const listed = occurrencesBetween({
      repeatRule: 'RRULE:FREQ=DAILY',
      dueDate: '2026-10-17T07:00:00.000Z',
      startDate: '2026-10-17T06:00:00.000Z',
      timeZone: MADRID,
      from: '2026-10-17T07:00:00.000Z',
      to: '2026-10-19T07:00:00.000Z',
    });
    expect(listed).toEqual({
      ok: true,
      occurrences: [
        { dueDate: '2026-10-17T07:00:00.000Z', startDate: '2026-10-17T06:00:00.000Z' },
        { dueDate: '2026-10-18T07:00:00.000Z', startDate: '2026-10-18T06:00:00.000Z' },
        { dueDate: '2026-10-19T07:00:00.000Z', startDate: '2026-10-19T06:00:00.000Z' },
      ],
    });
  });

  it('RF-705: an EXDATE drops that occurrence and leaves the rest of the series', () => {
    const excluded = excludeOccurrence('RRULE:FREQ=DAILY', '2026-10-20T07:00:00.000Z');
    expect(excluded.ok).toBe(true);
    if (!excluded.ok) {
      return;
    }
    expect(
      nextOccurrence({ ...due('2026-10-19T07:00:00.000Z'), repeatRule: excluded.rule }),
    ).toEqual({
      ok: true,
      occurrence: { dueDate: '2026-10-21T07:00:00.000Z', startDate: null },
    });
  });

  it('RF-706: monthly on the 31st uses the last day of February', () => {
    expect(
      nextOccurrence({
        ...due('2026-01-31T08:00:00.000Z'),
        repeatRule: 'RRULE:FREQ=MONTHLY;BYMONTHDAY=31',
      }),
    ).toEqual({
      ok: true,
      occurrence: { dueDate: '2026-02-28T08:00:00.000Z', startDate: null },
    });
    expect(
      nextOccurrence({
        ...due('2024-01-31T08:00:00.000Z'),
        repeatRule: 'RRULE:FREQ=MONTHLY;BYMONTHDAY=31',
      }),
    ).toEqual({
      ok: true,
      occurrence: { dueDate: '2024-02-29T08:00:00.000Z', startDate: null },
    });
    expect(
      nextOccurrence({
        ...due('2024-02-29T08:00:00.000Z'),
        repeatRule: 'RRULE:FREQ=YEARLY',
      }),
    ).toEqual({
      ok: true,
      occurrence: { dueDate: '2025-02-28T08:00:00.000Z', startDate: null },
    });
  });

  it('RF-706: 09:00 in Madrid stays 09:00 across the spring DST change', () => {
    expect(
      nextOccurrence({
        ...due('2026-03-28T08:00:00.000Z'),
        repeatRule: 'RRULE:FREQ=DAILY',
      }),
    ).toEqual({
      ok: true,
      occurrence: { dueDate: '2026-03-29T07:00:00.000Z', startDate: null },
    });
  });

  it('RF-703: weekly days counted from completion use the next listed weekday', () => {
    expect(
      nextOccurrence({
        ...due('2026-10-19T07:00:00.000Z'),
        repeatRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE',
        repeatFrom: 'completion_date',
        completedAt: '2026-10-20T13:00:00.000Z',
        occurrenceIndex: 1,
      }),
    ).toEqual({
      ok: true,
      occurrence: { dueDate: '2026-10-21T07:00:00.000Z', startDate: null },
    });
  });

  it('RF-701: COUNT ends a completion_date series, and a rule needs an anchor', () => {
    expect(
      nextOccurrence({
        ...due('2026-10-19T07:00:00.000Z'),
        repeatRule: 'RRULE:FREQ=DAILY;COUNT=1',
        repeatFrom: 'completion_date',
        completedAt: '2026-10-19T13:00:00.000Z',
        occurrenceIndex: 1,
      }),
    ).toEqual({ ok: true, occurrence: null });
    expect(
      nextOccurrence({
        ...due('2026-01-31T08:00:00.000Z'),
        repeatRule: 'RRULE:FREQ=MONTHLY;BYMONTHDAY=31;COUNT=5',
        repeatFrom: 'completion_date',
        completedAt: '2026-02-01T10:00:00.000Z',
        occurrenceIndex: null,
      }).ok,
    ).toBe(true);
    expect(
      nextOccurrence({
        repeatRule: 'RRULE:FREQ=DAILY',
        repeatFrom: 'due_date',
        dueDate: null,
        startDate: null,
        completedAt: null,
        timeZone: MADRID,
        isAllDay: false,
        occurrenceIndex: null,
      }),
    ).toEqual({ ok: false, reason: 'missing_anchor' });
  });

  it('rejects broken rules and keeps the original DTSTART when canonicalizing', () => {
    expect(parseRepeatRule('')).toEqual({ ok: false, reason: 'invalid_rule' });
    expect(parseRepeatRule('RRULE:FREQ=HOURLY')).toEqual({ ok: false, reason: 'invalid_rule' });
    expect(parseRepeatRule('RRULE:FREQ=DAILY\nRRULE:FREQ=WEEKLY')).toEqual({
      ok: false,
      reason: 'invalid_rule',
    });
    expect(parseRepeatRule('DTSTART:not-a-date\nRRULE:FREQ=DAILY')).toEqual({
      ok: false,
      reason: 'invalid_rule',
    });
    expect(parseRepeatRule('RRULE:FREQ=DAILY\nEXDATE:tomorrow')).toEqual({
      ok: false,
      reason: 'invalid_rule',
    });
    const canonical = canonicalizeRepeatRule(
      'DTSTART;TZID=Europe/Madrid:20260131T090000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=31',
      '2026-03-31T07:00:00.000Z',
      MADRID,
    );
    expect(canonical).toEqual({
      ok: true,
      rule: 'DTSTART;TZID=Europe/Madrid:20260131T090000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=31',
    });
    expect(canonicalizeRepeatRule('RRULE:FREQ=DAILY', null, MADRID)).toEqual({
      ok: false,
      reason: 'missing_anchor',
    });
    expect(
      occurrencesBetween({
        repeatRule: 'RRULE:FREQ=DAILY',
        dueDate: '2026-10-17T07:00:00.000Z',
        startDate: null,
        timeZone: MADRID,
        from: '2026-10-19T00:00:00.000Z',
        to: '2026-10-17T00:00:00.000Z',
      }),
    ).toEqual({ ok: false, reason: 'invalid_date' });
    const twice = excludeOccurrence('RRULE:FREQ=DAILY', 'not-a-date');
    expect(twice).toEqual({ ok: false, reason: 'invalid_date' });
  });

  it('accepts DTSTART, BYMONTH, a negative month day and a zoned EXDATE', () => {
    expect(
      parseRepeatRule(
        [
          'DTSTART:20260131T080000Z',
          'RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTH=1,3;BYMONTHDAY=31,-1;COUNT=4;UNTIL=20270131;WKST=MO',
          'EXDATE;TZID=Europe/Madrid:20260331T090000',
        ].join('\n'),
      ).ok,
    ).toBe(true);
    expect(parseRepeatRule('RRULE:FREQ=WEEKLY;BYDAY=MO,notaday')).toEqual({
      ok: false,
      reason: 'invalid_rule',
    });
    expect(parseRepeatRule('RRULE:INTERVAL=1')).toEqual({ ok: false, reason: 'invalid_rule' });
    expect(parseRepeatRule('RRULE:FREQ=DAILY;INTERVAL=0')).toEqual({
      ok: false,
      reason: 'invalid_rule',
    });
    expect(parseRepeatRule('RRULE:FREQ=DAILY;BYMONTH=13')).toEqual({
      ok: false,
      reason: 'invalid_rule',
    });
    expect(parseRepeatRule('RRULE:FREQ=DAILY;BYMONTHDAY=0')).toEqual({
      ok: false,
      reason: 'invalid_rule',
    });
    expect(parseRepeatRule('RRULE:FREQ=DAILY;WKST=XX')).toEqual({
      ok: false,
      reason: 'invalid_rule',
    });
    expect(parseRepeatRule('RRULE:FREQ=DAILY;UNTIL=nope')).toEqual({
      ok: false,
      reason: 'invalid_rule',
    });
    expect(parseRepeatRule('NOTHING')).toEqual({ ok: false, reason: 'invalid_rule' });
    expect(parseRepeatRule('DTSTART;TZID=Mars/Olympus:20260101T000000\nRRULE:FREQ=DAILY')).toEqual({
      ok: false,
      reason: 'invalid_rule',
    });
    expect(describeRepeatRule('RRULE:FREQ=WEEKLY;BYDAY=MO,WE')).toBe(
      'Cada semana los lunes y miércoles',
    );
    expect(describeRepeatRule('RRULE:FREQ=YEARLY;INTERVAL=2')).toBe('Cada 2 años');
    expect(describeRepeatRule('nope')).toBeNull();
    expect(
      buildRepeatRule({
        freq: 'weekly',
        interval: 2,
        weekdays: ['MO', 'WE'],
        count: 4,
        until: '2026-12-31T00:00:00.000Z',
      }).ok,
    ).toBe(true);
    expect(buildRepeatRule({ freq: 'monthly', monthDay: 32 })).toEqual({
      ok: false,
      reason: 'invalid_rule',
    });
    expect(
      canonicalizeRepeatRule('RRULE:FREQ=DAILY', '2026-10-17T07:00:00.000Z', 'Mars/Olympus'),
    ).toEqual({
      ok: false,
      reason: 'invalid_zone',
    });
    const once = excludeOccurrence('RRULE:FREQ=DAILY', '2026-10-20T07:00:00.000Z');
    expect(once.ok && excludeOccurrence(once.rule, '2026-10-20T07:00:00.000Z').ok).toBe(true);
  });

  it('RF-706: months in the BYMONTH list clamp day 31, and COUNT/UNTIL/EXDATE still apply', () => {
    expect(
      nextOccurrence({
        ...due('2026-01-31T08:00:00.000Z'),
        repeatRule: 'RRULE:FREQ=MONTHLY;BYMONTH=1,3;BYMONTHDAY=31',
      }),
    ).toEqual({
      ok: true,
      occurrence: { dueDate: '2026-03-31T07:00:00.000Z', startDate: null },
    });
    expect(
      nextOccurrence({
        ...due('2026-01-31T08:00:00.000Z'),
        repeatRule: 'RRULE:FREQ=MONTHLY;BYMONTHDAY=31;COUNT=2',
      }),
    ).toEqual({
      ok: true,
      occurrence: { dueDate: '2026-02-28T08:00:00.000Z', startDate: null },
    });
    expect(
      nextOccurrence({
        ...due('2026-02-28T08:00:00.000Z'),
        repeatRule:
          'DTSTART;TZID=Europe/Madrid:20260131T090000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=31;COUNT=2',
      }),
    ).toEqual({ ok: true, occurrence: null });
    const skipped = excludeOccurrence(
      'DTSTART;TZID=Europe/Madrid:20260131T090000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=31',
      '2026-02-28T08:00:00.000Z',
    );
    expect(skipped.ok).toBe(true);
    if (skipped.ok) {
      expect(
        nextOccurrence({ ...due('2026-01-31T08:00:00.000Z'), repeatRule: skipped.rule }),
      ).toEqual({
        ok: true,
        occurrence: { dueDate: '2026-03-31T07:00:00.000Z', startDate: null },
      });
    }
    expect(
      nextOccurrence({
        ...due('2024-02-29T08:00:00.000Z'),
        repeatRule: 'RRULE:FREQ=YEARLY',
        repeatFrom: 'completion_date',
        completedAt: '2024-03-02T10:00:00.000Z',
        occurrenceIndex: 1,
      }),
    ).toEqual({
      ok: true,
      occurrence: { dueDate: '2025-02-28T08:00:00.000Z', startDate: null },
    });
    expect(
      occurrencesBetween({
        repeatRule: 'RRULE:FREQ=DAILY',
        dueDate: null,
        startDate: null,
        timeZone: 'Mars/Olympus',
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-02T00:00:00.000Z',
      }),
    ).toEqual({ ok: false, reason: 'invalid_zone' });
    expect(
      nextOccurrence({
        ...due('2026-10-19T07:00:00.000Z'),
        repeatRule: 'RRULE:FREQ=DAILY',
        repeatFrom: 'completion_date',
        completedAt: null,
      }),
    ).toEqual({ ok: false, reason: 'missing_anchor' });
  });

  it('RF-706: a late completion does not skip the next due-date occurrence', () => {
    expect(
      nextOccurrence({
        ...due('2026-10-19T07:00:00.000Z'),
        repeatRule: 'RRULE:FREQ=DAILY',
        completedAt: '2026-10-21T13:00:00.000Z',
      }),
    ).toEqual({
      ok: true,
      occurrence: { dueDate: '2026-10-20T07:00:00.000Z', startDate: null },
    });
  });
});
