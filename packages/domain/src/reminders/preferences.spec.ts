import { expect, it } from 'vitest';
import { notificationDefault, notificationQuietUntil } from './preferences';
it('TTD-AUD-102 / RF-802: default matrix enables task/focus push and linked Telegram, daily email only', () => {
  expect(notificationDefault('task', 'push', false)).toBe(true);
  expect(notificationDefault('focus_end', 'telegram', true)).toBe(true);
  expect(notificationDefault('task', 'telegram', false)).toBe(false);
  expect(notificationDefault('daily_digest', 'email', false)).toBe(true);
  expect(notificationDefault('overdue', 'push', true)).toBe(false);
});
it('TTD-AUD-102 / RF-604: civil quiet hours cross midnight, honor start weekday and high priority', () => {
  const settings = { start: '22:00', end: '08:00', days: [4], allowHigh: true };
  expect(notificationQuietUntil('2026-10-22T21:00:00Z', 'Europe/Madrid', settings, false)).toBe(
    '2026-10-23T06:00:00.000Z',
  );
  expect(notificationQuietUntil('2026-10-23T05:00:00Z', 'Europe/Madrid', settings, false)).toBe(
    '2026-10-23T06:00:00.000Z',
  );
  expect(
    notificationQuietUntil('2026-10-22T21:00:00Z', 'Europe/Madrid', settings, true),
  ).toBeNull();
  expect(
    notificationQuietUntil('2026-10-23T21:00:00Z', 'Europe/Madrid', settings, false),
  ).toBeNull();
  expect(
    notificationQuietUntil(
      '2026-10-24T23:00:00Z',
      'Europe/Madrid',
      { ...settings, days: [6] },
      false,
    ),
  ).toBe('2026-10-25T07:00:00.000Z');
});
