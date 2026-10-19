import { describe, expect, it } from 'vitest';
import { wallClock } from '../dates/zoned';
import { mapGoogleEvent } from './google-events';

const zone = 'Europe/Madrid';

describe('mapGoogleEvent', () => {
  it('RF-2515: a one-day all-day event stays on that civil day', () => {
    const mapped = mapGoogleEvent(
      {
        id: 'day',
        summary: 'Festivo',
        start: { date: '2026-10-20' },
        end: { date: '2026-10-21' },
      },
      zone,
    );
    expect(mapped?.isAllDay).toBe(true);
    expect(wallClock(mapped?.startsAt ?? '', zone)).toMatchObject({
      year: 2026,
      month: 10,
      day: 20,
      hour: 0,
    });
    expect(wallClock(mapped?.endsAt ?? '', zone)).toMatchObject({
      year: 2026,
      month: 10,
      day: 20,
      hour: 23,
      minute: 59,
      second: 59,
    });
  });

  it('RF-2515: a multi-day all-day event covers every touched day', () => {
    const mapped = mapGoogleEvent(
      {
        id: 'span',
        summary: 'Viaje',
        start: { date: '2026-10-20' },
        end: { date: '2026-10-23' },
      },
      zone,
    );
    expect(wallClock(mapped?.startsAt ?? '', zone)?.day).toBe(20);
    expect(wallClock(mapped?.endsAt ?? '', zone)).toMatchObject({ day: 22, hour: 23 });
  });

  it('RF-2515: a timed event can cross local midnight', () => {
    const mapped = mapGoogleEvent(
      {
        id: 'night',
        summary: 'Turno',
        start: { dateTime: '2026-10-20T23:30:00+02:00', timeZone: zone },
        end: { dateTime: '2026-10-21T00:30:00+02:00', timeZone: zone },
      },
      zone,
    );
    expect(mapped?.isAllDay).toBe(false);
    expect(wallClock(mapped?.startsAt ?? '', zone)).toMatchObject({
      day: 20,
      hour: 23,
      minute: 30,
    });
    expect(wallClock(mapped?.endsAt ?? '', zone)).toMatchObject({ day: 21, hour: 0, minute: 30 });
  });

  it('RF-2515: cancelled instances keep their status for the incremental delete', () => {
    const mapped = mapGoogleEvent(
      {
        id: 'rec_1',
        status: 'cancelled',
        start: { dateTime: '2026-10-20T09:00:00+02:00' },
        end: { dateTime: '2026-10-20T10:00:00+02:00' },
      },
      zone,
    );
    expect(mapped?.status).toBe('cancelled');
    expect(mapped?.uid).toBe('rec_1');
  });

  it('RF-2515: 09:00 stays 09:00 local across the Madrid DST change', () => {
    const spring = mapGoogleEvent(
      {
        id: 'spring',
        start: { dateTime: '2026-03-29T09:00:00+02:00', timeZone: zone },
        end: { dateTime: '2026-03-29T10:00:00+02:00', timeZone: zone },
      },
      zone,
    );
    const autumn = mapGoogleEvent(
      {
        id: 'autumn',
        start: { dateTime: '2026-10-25T09:00:00+01:00', timeZone: zone },
        end: { dateTime: '2026-10-25T10:00:00+01:00', timeZone: zone },
      },
      zone,
    );
    expect(wallClock(spring?.startsAt ?? '', zone)?.hour).toBe(9);
    expect(wallClock(autumn?.startsAt ?? '', zone)?.hour).toBe(9);
  });

  it('RF-2515: missing title and missing end use the documented defaults', () => {
    const mapped = mapGoogleEvent(
      { id: 'bare', start: { dateTime: '2026-10-20T09:00:00+02:00', timeZone: zone } },
      zone,
    );
    expect(mapped?.title).toBe('(sin título)');
    expect(
      new Date(mapped?.endsAt ?? '').getTime() - new Date(mapped?.startsAt ?? '').getTime(),
    ).toBe(60 * 60 * 1000);
    expect(mapGoogleEvent({ summary: 'sin id' }, zone)).toBeNull();
    expect(mapGoogleEvent({ id: 'no-start' }, zone)).toBeNull();
  });
});
