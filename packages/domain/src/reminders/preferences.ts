import { addCalendarDays, wallClock } from '../dates/zoned';
import { quietUntil } from './delivery';
export const NOTIFICATION_KINDS = [
  'task',
  'focus_end',
  'daily_digest',
  'shutdown_digest',
  'overdue',
  'due_soon',
  'habit',
  'countdown',
] as const;
export const NOTIFICATION_CHANNELS = ['push', 'email', 'telegram'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export function notificationDefault(kind: string, channel: string, linked: boolean): boolean {
  return channel === 'email'
    ? kind === 'daily_digest'
    : (kind === 'task' || kind === 'focus_end') &&
        (channel === 'push' || (channel === 'telegram' && linked));
}
export function notificationQuietUntil(
  now: string,
  timeZone: string,
  settings: {
    start: string | null;
    end: string | null;
    days: readonly number[];
    allowHigh: boolean;
  },
  high: boolean,
): string | null {
  if (high && settings.allowHigh) return null;
  const wall = wallClock(now, timeZone);
  if (!wall || settings.start === null || settings.end === null) return null;
  const minutes = wall.hour * 60 + wall.minute;
  const start = Number(settings.start.slice(0, 2)) * 60 + Number(settings.start.slice(3));
  const end = Number(settings.end.slice(0, 2)) * 60 + Number(settings.end.slice(3));
  const origin = start > end && minutes < end ? addCalendarDays(wall, -1) : wall;
  const day = new Date(Date.UTC(origin.year, origin.month - 1, origin.day)).getUTCDay();
  if (!settings.days.includes(day)) return null;
  return quietUntil(now, timeZone, settings.start, settings.end);
}
