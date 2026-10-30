import { describe, expect, it } from 'vitest';
import { DomainEvent } from '../../events/domain-events.js';
import { calendarVersionEvent } from './calendar-version.js';

describe('calendar version events', () => {
  it('bumps for a dated task, a project color and a hidden calendar', () => {
    expect(calendarVersionEvent(DomainEvent.taskUpdated, {})).toBe(true);
    expect(calendarVersionEvent(DomainEvent.projectUpdated, {})).toBe(true);
    expect(calendarVersionEvent(DomainEvent.calendarSubscriptionUpdated, { visible: false })).toBe(
      true,
    );
    expect(calendarVersionEvent(DomainEvent.calendarEventImported, { imported: 1 })).toBe(true);
  });

  it('leaves reminders and a disconnect that keeps events alone', () => {
    expect(calendarVersionEvent(DomainEvent.taskDueSoon, {})).toBe(false);
    expect(calendarVersionEvent(DomainEvent.taskOverdue, {})).toBe(false);
    expect(calendarVersionEvent(DomainEvent.taskLinkAdded, {})).toBe(false);
    expect(calendarVersionEvent(DomainEvent.calendarSyncFailed, {})).toBe(false);
    expect(
      calendarVersionEvent(DomainEvent.googleDisconnected, {
        google: { imported_events_removed: false },
      }),
    ).toBe(false);
    expect(
      calendarVersionEvent(DomainEvent.googleDisconnected, {
        google: { imported_events_removed: true },
      }),
    ).toBe(true);
  });
});
