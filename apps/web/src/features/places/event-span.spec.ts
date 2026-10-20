import { describe, expect, it } from 'vitest';
import { eventDayRange, eventSpan, isSpanningEvent } from './event-span';
import type { ExternalEventView } from '../calendar/ExternalEvent';

const event: ExternalEventView = {
  id: 'hotel',
  title: 'Hotel',
  starts_at: '2026-10-23T00:00:00Z',
  ends_at: '2026-10-26T00:00:00Z',
  time_zone: 'UTC',
  is_all_day: true,
};

describe('SEM-3 external calendar spans', () => {
  it('uses an exclusive end and one continuous span clipped to visible columns', () => {
    const days = [23, 24, 25, 26].map((day) => new Date(2026, 9, day));
    expect(eventDayRange(event)).toEqual({ start: '2026-10-23', end: '2026-10-25' });
    expect(eventSpan(event, days)).toEqual({ column: 2, span: 3 });
    expect(eventSpan(event, [new Date(2026, 9, 26)])).toBeNull();
    expect(isSpanningEvent(event)).toBe(true);
  });
  it('does not turn a timed event ending at midnight into an extra day', () => {
    expect(
      eventDayRange({
        ...event,
        is_all_day: false,
        starts_at: '2026-10-23T20:00:00Z',
        ends_at: '2026-10-24T00:00:00Z',
      }),
    ).toEqual({ start: '2026-10-23', end: '2026-10-23' });
  });
});

it('RF-1103: a timed multi-day event never becomes all-day', () => {
  expect(
    isSpanningEvent({
      ...event,
      is_all_day: false,
      starts_at: '2026-10-23T23:00:00Z',
      ends_at: '2026-10-24T02:00:00Z',
    }),
  ).toBe(false);
});
