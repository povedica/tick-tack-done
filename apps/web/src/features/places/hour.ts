export const GRID_START_HOUR = 0;
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

/** Connected overlap groups share lanes; touching intervals do not overlap. */
export function layoutHourItems(
  items: readonly { id: string; start: number; end: number }[],
): { id: string; start: number; end: number; lane: number; lanes: number }[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const output: { id: string; start: number; end: number; lane: number; lanes: number }[] = [];
  let group: typeof output = [];
  let ends: number[] = [];
  let until = -1;
  const flush = () => {
    for (const item of group) output.push({ ...item, lanes: ends.length });
    group = [];
    ends = [];
  };
  for (const item of sorted) {
    if (item.start >= until && group.length) flush();
    let lane = ends.findIndex((end) => end <= item.start);
    if (lane < 0) lane = ends.length;
    ends[lane] = item.end;
    group.push({ ...item, lane, lanes: 1 });
    until = Math.max(group.length === 1 ? item.end : until, item.end);
  }
  flush();
  return output;
}
