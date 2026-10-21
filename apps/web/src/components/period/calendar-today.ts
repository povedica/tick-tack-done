import { calendarDay, shiftDayKey, zonedWallTime } from '../../features/today/groups';
export function todayInZone(now: Date, zone: string): string {
  return calendarDay(now.toISOString(), zone);
}
/** Recompute the next local midnight: a civil day may have 23 or 25 hours. */
export function nextMidnight(now: Date, zone: string): number {
  const next = zonedWallTime(shiftDayKey(todayInZone(now, zone), 1), 0, 0, zone);
  if (!next) throw new Error('Invalid calendar midnight');
  return Date.parse(next);
}
