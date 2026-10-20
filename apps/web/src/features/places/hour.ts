export const GRID_START_HOUR = 6;
export const GRID_END_HOUR = 24;
export const HOUR_PX = 48;

export function minutesInZone(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return 0;
  }
  return hour * 60 + minute;
}

export function hourBlock(
  startMinutes: number,
  endMinutes: number,
): { readonly top: number; readonly height: number } {
  const start = GRID_START_HOUR * 60;
  const end = GRID_END_HOUR * 60;
  const from = Math.min(end, Math.max(start, startMinutes));
  const rawEnd = endMinutes <= startMinutes ? end : endMinutes;
  const to = Math.min(end, Math.max(from + 15, rawEnd));
  return {
    top: ((from - start) / 60) * HOUR_PX,
    height: Math.max(HOUR_PX / 2, ((to - from) / 60) * HOUR_PX),
  };
}
