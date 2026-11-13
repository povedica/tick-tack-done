import { canonicalJson } from '../ticky/canonical-json';

/** Summary refuses a window longer than this. A year fits. */
export const SUMMARY_MAX_DAYS = 400;
/** Range refuses a window longer than this. A month fits. */
export const RANGE_MAX_DAYS = 62;
export const RANGE_MAX_LIMIT = 500;
/** Year marks keep at most three task colors, then at most eight event colors. */
export const TASK_COLOR_CAP = 3;
export const EVENT_COLOR_CAP = 8;

const CIVIL_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A real civil day, or null when the text is not one. */
export function parseCivilDay(value: string): string | null {
  const match = CIVIL_DAY.exec(value);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

/** Inclusive day count. Null when either day is invalid or the end is before the start. */
export function inclusiveCivilDays(from: string, to: string): number | null {
  const start = parseCivilDay(from);
  const end = parseCivilDay(to);
  if (start === null || end === null || end < start) {
    return null;
  }
  const elapsed = Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`);
  return Math.round(elapsed / 86_400_000) + 1;
}

/**
 * Lists the caller may aggregate.
 * `null` means every owned list. An empty array means no task matches.
 * Requested ids are intersected with the token allowlist before any query.
 */
export function authorizedLists(
  listIds: readonly string[] | null,
  requested: readonly string[],
): readonly string[] | null {
  if (listIds === null && requested.length === 0) {
    return null;
  }
  if (listIds === null) {
    return [...requested].sort();
  }
  if (requested.length === 0) {
    return [...listIds].sort();
  }
  const allowed = new Set(listIds);
  return requested.filter((id) => allowed.has(id)).sort();
}

export interface CalendarCursorKey {
  readonly day: string;
  readonly startsAt: string;
  readonly id: string;
}

/** Keyset `(local_start_day, starts_at, id)`. The text is opaque to clients. */
export function encodeCalendarCursor(key: CalendarCursorKey): string {
  return [key.day, key.startsAt, key.id].map((part) => encodeURIComponent(part)).join('~');
}

export function decodeCalendarCursor(cursor: string): CalendarCursorKey | null {
  const parts = cursor.split('~');
  if (parts.length !== 3) {
    return null;
  }
  const day = decodeURIComponent(parts[0] ?? '');
  const startsAt = decodeURIComponent(parts[1] ?? '');
  const id = decodeURIComponent(parts[2] ?? '').toLowerCase();
  if (parseCivilDay(day) === null || !UUID.test(id) || !Number.isFinite(Date.parse(startsAt))) {
    return null;
  }
  return { day, startsAt, id };
}

/** Stable preimage of the representation hash. The API hashes this before the main query. */
export interface CalendarScope {
  readonly kind: 'summary' | 'range';
  readonly from: string;
  readonly to: string;
  readonly zone: string;
  readonly context: string;
  readonly workMode: string;
  readonly workProjects: readonly string[];
  readonly workFolders: readonly string[];
  readonly workTags: readonly string[];
  readonly lists: string;
  readonly tokenId: string;
  readonly tags: readonly string[];
  readonly cals: readonly string[];
  readonly include: string;
  readonly grain: string;
  readonly cursor: string;
}

export function calendarScopeKey(scope: CalendarScope): string {
  return canonicalJson({
    kind: scope.kind,
    from: scope.from,
    to: scope.to,
    zone: scope.zone,
    context: scope.context,
    workMode: scope.workMode,
    workProjects: [...scope.workProjects],
    workFolders: [...scope.workFolders],
    workTags: [...scope.workTags],
    lists: scope.lists,
    tokenId: scope.tokenId,
    tags: [...scope.tags],
    cals: [...scope.cals],
    include: scope.include,
    grain: scope.grain,
    cursor: scope.cursor,
  });
}

export function listScopeKey(listIds: readonly string[] | null): string {
  if (listIds === null) {
    return '*';
  }
  return [...listIds].sort().join(',');
}

export interface ZoomMark {
  readonly key: string;
  readonly taskCount: number;
  readonly eventCount: number;
  readonly taskColors: readonly string[];
  readonly eventColors: readonly string[];
  readonly taskTruncated: boolean;
  readonly eventTruncated: boolean;
}

export interface ZoomCell {
  readonly n: number;
  readonly c: readonly string[];
}

/** Day cells, or one cell per month. Empty days stay out of the map. */
export function zoomDensity(
  marks: readonly ZoomMark[],
  granularity: 'day' | 'month',
): { readonly cells: Readonly<Record<string, ZoomCell>>; readonly truncated: boolean } {
  const sorted = [...marks].sort(byKey);
  if (granularity === 'day') {
    return densityOf(sorted.map((mark) => [mark.key, [mark]] as const));
  }
  const groups = new Map<string, ZoomMark[]>();
  for (const mark of sorted) {
    const month = mark.key.slice(0, 7);
    const list = groups.get(month);
    if (list === undefined) {
      groups.set(month, [mark]);
    } else {
      list.push(mark);
    }
  }
  return densityOf([...groups.entries()]);
}

function densityOf(groups: readonly (readonly [string, readonly ZoomMark[]])[]): {
  readonly cells: Readonly<Record<string, ZoomCell>>;
  readonly truncated: boolean;
} {
  const cells: Record<string, ZoomCell> = {};
  let truncated = false;
  for (const [key, marks] of groups) {
    const taskColors: string[] = [];
    const eventColors: string[] = [];
    let count = 0;
    let cut = false;
    for (const mark of marks) {
      count += mark.taskCount + mark.eventCount;
      cut = cut || mark.taskTruncated || mark.eventTruncated;
      for (const color of mark.taskColors) {
        if (taskColors.length >= TASK_COLOR_CAP) {
          cut = true;
          break;
        }
        if (!taskColors.includes(color)) {
          taskColors.push(color);
        }
      }
      for (const color of mark.eventColors) {
        if (eventColors.length >= EVENT_COLOR_CAP) {
          cut = true;
          break;
        }
        eventColors.push(color);
      }
    }
    cells[key] = { n: count, c: [...taskColors, ...eventColors] };
    truncated = truncated || cut;
  }
  return { cells, truncated };
}

function byKey(left: ZoomMark, right: ZoomMark): number {
  if (left.key < right.key) {
    return -1;
  }
  if (left.key > right.key) {
    return 1;
  }
  return 0;
}
