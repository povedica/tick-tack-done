import { calendarDateKey } from '@reflexionia/domain';
import type { ExternalEventView } from '../calendar/ExternalEvent';
import { eventDayRange } from './event-span';

const TASK_MARK_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const ACCENT = 'var(--accent)';

export interface DaySummary {
  readonly count: number;
  readonly colors: readonly string[];
}

export interface YearIndexTask {
  readonly start_date?: string | null;
  readonly due_date: string | null;
  readonly project_id: string;
  readonly time_zone?: string | null;
}

interface MutableDay {
  count: number;
  colors: string[];
}

export function buildDayIndex(
  tasks: readonly YearIndexTask[],
  events: readonly ExternalEventView[],
  colors: ReadonlyMap<string, string>,
  opts: { readonly fallbackZone: string },
): ReadonlyMap<string, DaySummary> {
  const days = new Map<string, MutableDay>();
  const taskDayKeys = new Map<string, string>();
  const eventRanges = new Map<string, { start: string; end: string }>();
  const slot = (key: string): MutableDay => {
    const existing = days.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const created: MutableDay = { count: 0, colors: [] };
    days.set(key, created);
    return created;
  };

  for (const task of tasks) {
    const effective = task.start_date ?? task.due_date;
    if (effective === null || effective.length === 0) {
      continue;
    }
    const day = slot(taskDayKey(taskDayKeys, effective, task.time_zone ?? opts.fallbackZone));
    day.count += 1;
    if (day.colors.length >= 3) {
      continue;
    }
    const raw = colors.get(task.project_id);
    const color = raw !== undefined && TASK_MARK_COLOR.test(raw) ? raw : ACCENT;
    if (!day.colors.includes(color)) {
      day.colors.push(color);
    }
  }

  for (const event of events) {
    const { start, end } = cachedEventRange(eventRanges, event);
    const color = event.color ?? ACCENT;
    for (let key: string | null = start; key !== null && key <= end; key = nextCivilDay(key)) {
      const day = slot(key);
      day.count += 1;
      day.colors.push(color);
    }
  }

  const index = new Map<string, DaySummary>();
  for (const [key, day] of days) {
    index.set(key, { count: day.count, colors: day.colors });
  }
  return index;
}

function taskDayKey(cache: Map<string, string>, iso: string, zone: string): string {
  const id = `${zone}\0${iso}`;
  const hit = cache.get(id);
  if (hit !== undefined) {
    return hit;
  }
  const key = calendarDateKey(iso, zone);
  cache.set(id, key);
  return key;
}

function cachedEventRange(
  cache: Map<string, { start: string; end: string }>,
  event: ExternalEventView,
): { start: string; end: string } {
  const id = [
    event.is_all_day ? '1' : '0',
    event.time_zone ?? '',
    event.starts_at,
    event.ends_at ?? '',
  ].join('\0');
  const hit = cache.get(id);
  if (hit !== undefined) {
    return hit;
  }
  const range = eventDayRange(event);
  cache.set(id, range);
  return range;
}

function nextCivilDay(key: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
    return null;
  }
  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
  const iso = next.toISOString().slice(0, 10);
  return iso > key ? iso : null;
}
