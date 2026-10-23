import { normalizeReminderTrigger } from './trigger';
import { describe, expect, it } from 'vitest';
import {
  isAccountReminderTrigger,
  LIST_REMINDER_OFF,
  nextConstantFire,
  nextDailyReminder,
  parseTrigger,
  REMINDER_HORIZON_MS,
  reminderDisposition,
  reminderFireAt,
  resolveDefaultReminder,
  afternoonInstant,
  snoozeReminder,
} from './trigger';

describe('reminders', () => {
  it('picks the list override, then the account default, and stays quiet when the list is off', () => {
    expect(isAccountReminderTrigger('-PT15M')).toBe(true);
    expect(isAccountReminderTrigger('off')).toBe(false);
    expect(resolveDefaultReminder('-PT30M', null)).toBe('-PT30M');
    expect(resolveDefaultReminder('-PT30M', '-PT5M')).toBe('-PT5M');
    expect(resolveDefaultReminder('-PT30M', LIST_REMINDER_OFF)).toBeNull();
    expect(resolveDefaultReminder(null, null)).toBeNull();
    expect(parseTrigger('-PT0M').ok).toBe(true);
    expect(parseTrigger('-P1D').ok).toBe(true);
  });

  it('RF-801: relative triggers and an absolute instant', () => {
    expect(parseTrigger('-PT30M')).toMatchObject({ ok: true, offsetMs: -30 * 60_000 });
    expect(parseTrigger('TRIGGER:-PT5M')).toEqual({
      ok: true,
      kind: 'relative',
      related: 'due',
      offsetMs: -5 * 60_000,
    });
    expect(parseTrigger('TRIGGER;RELATED=START:-P1D')).toMatchObject({
      ok: true,
      related: 'start',
      offsetMs: -86_400_000,
    });
    expect(parseTrigger('TRIGGER:P0DT9H0M0S')).toMatchObject({ offsetMs: 9 * 3_600_000 });
    expect(
      reminderFireAt({
        trigger: 'TRIGGER:-PT5M',
        type: 'relative',
        dueDate: '2026-10-17T10:00:00.000Z',
        startDate: null,
        absoluteAt: null,
      }),
    ).toEqual({ ok: true, fireAt: '2026-10-17T09:55:00.000Z' });
    expect(
      reminderFireAt({
        trigger: 'TRIGGER;VALUE=DATE-TIME:20261017T090000Z',
        type: 'absolute',
        dueDate: null,
        startDate: null,
        absoluteAt: '2026-10-17T09:00:00.000Z',
      }),
    ).toEqual({ ok: true, fireAt: '2026-10-17T09:00:00.000Z' });
    expect(
      reminderFireAt({
        trigger: 'TRIGGER:PT0S',
        type: 'location',
        dueDate: '2026-10-17T10:00:00.000Z',
        startDate: null,
        absoluteAt: null,
      }),
    ).toEqual({ ok: true, fireAt: null });
    expect(parseTrigger('TRIGGER:soon')).toEqual({ ok: false, reason: 'invalid_trigger' });
    expect(parseTrigger('TRIGGER;VALUE=DATE-TIME:20261017T090000Z')).toMatchObject({
      ok: true,
      kind: 'absolute',
    });
    expect(
      reminderFireAt({
        trigger: 'TRIGGER:-PT5M',
        type: 'relative',
        dueDate: null,
        startDate: null,
        absoluteAt: null,
      }),
    ).toEqual({ ok: false, reason: 'missing_anchor' });
    expect(
      reminderFireAt({
        trigger: 'TRIGGER:PT0S',
        type: 'absolute',
        dueDate: null,
        startDate: null,
        absoluteAt: null,
      }),
    ).toEqual({ ok: false, reason: 'invalid_date' });
  });

  it('RF-803: a constant reminder schedules the next interval', () => {
    expect(nextConstantFire('2026-10-17T10:00:00.000Z', 15)).toBe('2026-10-17T10:15:00.000Z');
    expect(nextConstantFire('2026-10-17T10:00:00.000Z', 0)).toBeNull();
  });

  it('NT-08: esta tarde is the next local 18:00', () => {
    expect(afternoonInstant('2026-10-19T12:00:00.000Z', 'Europe/Madrid')).toBe(
      '2026-10-19T16:00:00.000Z',
    );
    expect(afternoonInstant('2026-10-19T16:30:00.000Z', 'Europe/Madrid')).toBe(
      '2026-10-20T16:00:00.000Z',
    );
    expect(afternoonInstant('2026-10-19T12:00:00.000Z', 'Mars/Olympus')).toBeNull();
  });

  it('RF-804: snooze presets are 10 minutes, 1 hour, tomorrow or a custom instant', () => {
    const now = '2026-10-17T13:00:00.000Z';
    expect(snoozeReminder({ now, timeZone: 'Europe/Madrid', preset: '10m' })).toEqual({
      ok: true,
      until: '2026-10-17T13:10:00.000Z',
    });
    expect(snoozeReminder({ now, timeZone: 'Europe/Madrid', preset: '1h' })).toEqual({
      ok: true,
      until: '2026-10-17T14:00:00.000Z',
    });
    expect(snoozeReminder({ now, timeZone: 'Europe/Madrid', preset: 'tomorrow' })).toEqual({
      ok: true,
      until: '2026-10-18T13:00:00.000Z',
    });
    expect(
      snoozeReminder({
        now,
        timeZone: 'Europe/Madrid',
        preset: 'custom',
        until: '2026-10-19T09:00:00.000Z',
      }),
    ).toEqual({ ok: true, until: '2026-10-19T09:00:00.000Z' });
    expect(snoozeReminder({ now, timeZone: 'Europe/Madrid', preset: 'custom' })).toEqual({
      ok: false,
      reason: 'date_required',
    });
    expect(snoozeReminder({ now, timeZone: 'Mars/Olympus', preset: '10m' })).toEqual({
      ok: false,
      reason: 'invalid_zone',
    });
  });

  it('RF-805: the daily reminder is the next local clock time', () => {
    expect(
      nextDailyReminder({
        time: '08:00',
        timeZone: 'Europe/Madrid',
        now: '2026-10-17T05:00:00.000Z',
      }),
    ).toEqual({ ok: true, fireAt: '2026-10-17T06:00:00.000Z' });
    expect(
      nextDailyReminder({
        time: '08:00',
        timeZone: 'Europe/Madrid',
        now: '2026-10-17T07:00:00.000Z',
      }),
    ).toEqual({ ok: true, fireAt: '2026-10-18T06:00:00.000Z' });
    expect(
      nextDailyReminder({
        time: '25:00',
        timeZone: 'Europe/Madrid',
        now: '2026-10-17T07:00:00.000Z',
      }),
    ).toEqual({
      ok: false,
      reason: 'invalid_time',
    });
    expect(
      nextDailyReminder({
        time: '08:00',
        timeZone: 'Mars/Olympus',
        now: '2026-10-17T07:00:00.000Z',
      }),
    ).toEqual({
      ok: false,
      reason: 'invalid_zone',
    });
  });

  it('RF-808: fires inside 48h are scheduled, and a catch-up marks the past as late', () => {
    const now = '2026-10-17T12:00:00.000Z';
    expect(REMINDER_HORIZON_MS).toBe(48 * 60 * 60 * 1000);
    expect(
      reminderDisposition(new Date(Date.parse(now) + 47 * 3_600_000).toISOString(), now, false),
    ).toBe('scheduled');
    expect(
      reminderDisposition(new Date(Date.parse(now) + 49 * 3_600_000).toISOString(), now, false),
    ).toBe('beyond_horizon');
    expect(reminderDisposition(new Date(Date.parse(now) - 60_000).toISOString(), now, true)).toBe(
      'late',
    );
    expect(reminderDisposition(new Date(Date.parse(now) - 60_000).toISOString(), now, false)).toBe(
      'fire',
    );
    expect(reminderDisposition('nope', now, false)).toBe('beyond_horizon');
  });
});

it.each(['TRIGGER:-PT15M', '-PT15M'])('TTD-AUD-85.5 RF-801 normalizes %s', (trigger) => {
  expect(normalizeReminderTrigger(trigger)).toBe('-PT15M');
});
