import { dateTimeFormat } from '../../lib/dates/formatters';
export const GRID_START_HOUR = 0;
export const GRID_END_HOUR = 24;
export const HOUR_PX = 48;

export function minutesInZone(iso: string, timeZone: string): number {
  const parts = dateTimeFormat('en-GB', {
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
  limitMinutes = GRID_END_HOUR * 60,
): { readonly top: number; readonly height: number } {
  const start = GRID_START_HOUR * 60;
  const end = limitMinutes;
  const from = Math.min(end, Math.max(start, startMinutes));
  const rawEnd = endMinutes <= startMinutes ? end : endMinutes;
  const to = Math.min(end, Math.max(from + 15, rawEnd));
  return {
    top: ((from - start) / 60) * HOUR_PX,
    height: Math.max(HOUR_PX / 4, ((to - from) / 60) * HOUR_PX),
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

/** Reserve the last readable lane for an overflow control in each overlap group. */
export function limitHourLanes(layout: ReturnType<typeof layoutHourItems>, width: number) {
  const capacity = Math.max(1, Math.floor((width + 2) / 66));
  const visible: typeof layout = [];
  const overflow: { start: number; end: number; lane: number; lanes: number; count: number }[] = [];
  let group: typeof layout = [];
  let until = -1;
  const flush = () => {
    const lanes = Math.max(1, ...group.map((item) => item.lanes));
    const limit = Math.min(lanes, capacity);
    const shown = lanes > capacity ? limit - 1 : limit;
    const hidden = group.filter((item) => item.lane >= shown);
    visible.push(
      ...group.filter((item) => item.lane < shown).map((item) => ({ ...item, lanes: limit })),
    );
    if (hidden.length)
      overflow.push({
        start: Math.min(...group.map((item) => item.start)),
        end: Math.max(...group.map((item) => item.end)),
        lane: limit - 1,
        lanes: limit,
        count: hidden.length,
      });
    group = [];
  };
  for (const item of layout) {
    if (group.length && item.start >= until) flush();
    until = group.length ? Math.max(until, item.end) : item.end;
    group.push(item);
  }
  if (group.length) flush();
  return { visible, overflow };
}
