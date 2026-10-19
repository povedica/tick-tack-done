import { describe, expect, it } from 'vitest';
import {
  allDayClockConflict,
  dueSignal,
  isAtDueTrigger,
  quietUntil,
  retryDelayMs,
  skipPastEnqueue,
} from './delivery';

const NOW = '2026-10-19T10:00:00.000Z';

describe('reminder delivery rules', () => {
  it('NT-04: a fire time that has already passed is not enqueued', () => {
    expect(skipPastEnqueue('2026-10-19T09:59:00.000Z', NOW)).toBe(true);
    expect(skipPastEnqueue('2026-10-19T10:05:00.000Z', NOW)).toBe(false);
  });

  it('NT-01: a timed task inside 24h is due_soon and a just-missed one is overdue', () => {
    expect(dueSignal({ due: '2026-10-19T13:35:00.000Z', now: NOW, isAllDay: false })).toBe(
      'due_soon',
    );
    expect(dueSignal({ due: '2026-10-19T09:59:00.000Z', now: NOW, isAllDay: false })).toBe(
      'overdue',
    );
    expect(dueSignal({ due: '2026-04-17T10:00:00.000Z', now: NOW, isAllDay: false })).toBe('skip');
    expect(dueSignal({ due: '2026-10-19T00:00:00.000Z', now: NOW, isAllDay: true })).toBe('skip');
  });

  it('RF-808: catch-up still marks a missed due inside 48h as overdue', () => {
    const hourAgo = '2026-10-19T09:00:00.000Z';
    expect(dueSignal({ due: hourAgo, now: NOW, isAllDay: false })).toBe('skip');
    expect(dueSignal({ due: hourAgo, now: NOW, isAllDay: false, catchUp: true })).toBe('overdue');
    expect(
      dueSignal({ due: '2026-04-17T10:00:00.000Z', now: NOW, isAllDay: false, catchUp: true }),
    ).toBe('skip');
    expect(
      dueSignal({ due: '2026-10-19T00:00:00.000Z', now: NOW, isAllDay: true, catchUp: true }),
    ).toBe('skip');
  });

  it('NT-02: an at-due trigger is the same notice as due_soon', () => {
    expect(isAtDueTrigger('TRIGGER:-PT0M')).toBe(true);
    expect(isAtDueTrigger('-PT0M')).toBe(true);
    expect(isAtDueTrigger('TRIGGER:-PT5M')).toBe(false);
  });

  it('NT-09: retries wait 1, 5 and 15 minutes, then stop', () => {
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(2)).toBe(300_000);
    expect(retryDelayMs(3)).toBe(900_000);
    expect(retryDelayMs(4)).toBeNull();
  });

  it('NT-10: quiet hours defer until the local end, including overnight', () => {
    const evening = '2026-10-19T20:30:00.000Z';
    const deferred = quietUntil(evening, 'Europe/Madrid', '22:00', '07:00');
    expect(deferred).not.toBeNull();
    expect(Date.parse(deferred ?? '')).toBeGreaterThan(Date.parse(evening));
    expect(quietUntil(NOW, 'Europe/Madrid', '22:00', '07:00')).toBeNull();
  });

  it('NT-13: all-day with a clock time conflicts; midnight does not', () => {
    expect(allDayClockConflict('2026-10-19T13:35:00.000Z', true, 'Europe/Madrid')).toBe(true);
    expect(allDayClockConflict('2026-10-18T22:00:00.000Z', true, 'Europe/Madrid')).toBe(false);
    expect(allDayClockConflict('2026-10-19T13:35:00.000Z', false, 'Europe/Madrid')).toBe(false);
  });
});
