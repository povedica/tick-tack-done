import { ApiError, type Task } from '@reflexionia/sdk';
import { api, apiOptions } from '../../api';
import { readCsrfToken } from '../auth/session';
import type { ExternalEventView } from './ExternalEvent';
import { paintColor, type SummaryCell } from '../places/summary-days';

export interface DensityRequest {
  readonly from: string;
  readonly to: string;
  readonly context: 'auto';
  readonly lists?: string;
  readonly tags?: string;
  readonly cals?: string;
  readonly include?: 'tasks' | 'events';
  readonly empty: boolean;
}

export interface CalendarSummaryBody {
  readonly time_zone: string;
  readonly version: string;
  readonly granularity: 'day' | 'month';
  readonly days: Readonly<Record<string, SummaryCell>>;
  readonly truncated: boolean;
}

export interface DayRangeBody {
  readonly tasks: readonly Task[];
  readonly events: readonly ExternalEventView[];
  readonly taskColors: ReadonlyMap<string, string>;
}

const STORAGE_PREFIX = 'ttd.calendar.summary.v1:';

export function densityScopeFor(input: {
  readonly from: string;
  readonly to: string;
  readonly lists: string | null;
  readonly tags: string | null;
  readonly cals: string | null;
  readonly projectId: string | undefined;
  readonly tagId: string | undefined;
}): DensityRequest {
  const lists = narrow(csvOrNone(input.lists), input.projectId);
  const tags = narrow(csvOrNone(input.tags), input.tagId);
  const cals = csvOrNone(input.cals);
  const tasks = !lists.empty && !tags.empty;
  const events = cals === null || cals.length > 0;
  const include = includeOf(tasks, events);
  return {
    from: input.from,
    to: input.to,
    context: 'auto',
    ...(tasks && lists.value !== undefined ? { lists: lists.value } : {}),
    ...(tasks && tags.value !== undefined ? { tags: tags.value } : {}),
    ...(events && cals !== null ? { cals: cals.join(',') } : {}),
    ...(include === undefined ? {} : { include }),
    empty: !tasks && !events,
  };
}

export function summaryPath(request: DensityRequest): string {
  const params = new URLSearchParams();
  params.set('from', request.from);
  params.set('to', request.to);
  params.set('granularity', 'day');
  params.set('context', request.context);
  if (request.lists !== undefined) params.set('lists', request.lists);
  if (request.tags !== undefined) params.set('tags', request.tags);
  if (request.cals !== undefined) params.set('cals', request.cals);
  if (request.include !== undefined) params.set('include', request.include);
  return `/api/v1/calendar/summary?${params.toString()}`;
}

export function dayRangeQuery(day: string, request: DensityRequest) {
  return {
    queryKey: ['calendar-range', day, scopeKey(request)] as const,
    queryFn: () => loadDayRange(day, request),
    staleTime: 30_000,
  };
}

/** Revalidates with the stored ETag. A 304 keeps the previous body. */
export async function fetchCalendarSummary(request: DensityRequest): Promise<CalendarSummaryBody> {
  const path = summaryPath(request);
  const stored = readStored(path);
  const response = await fetch(path, {
    method: 'GET',
    credentials: apiOptions().credentials ?? 'same-origin',
    cache: 'no-store',
    headers: summaryHeaders(stored?.etag),
  });
  if (response.status === 304) {
    if (stored !== null) return stored.body;
    return fetchCalendarSummaryFresh(path);
  }
  if (!response.ok) {
    throw await errorOf(response);
  }
  const body = parseSummary(await response.json());
  const etag = response.headers.get('etag');
  if (etag !== null && etag.length > 0) {
    writeStored(path, { etag, body });
  }
  return body;
}

export async function loadDayRange(day: string, request: DensityRequest): Promise<DayRangeBody> {
  const pages: unknown[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 4; page += 1) {
    const body = await api.calendarRange({
      from: day,
      to: day,
      context: request.context,
      ...(request.lists === undefined ? {} : { lists: request.lists }),
      ...(request.tags === undefined ? {} : { tags: request.tags }),
      ...(request.cals === undefined ? {} : { cals: request.cals }),
      ...(request.include === undefined ? {} : { include: request.include }),
      fields: 'full',
      limit: 500,
      ...(cursor === undefined ? {} : { cursor }),
    });
    pages.push(body);
    const next = nextCursor(body);
    if (next === null) break;
    cursor = next;
  }
  return entriesToDay(pages, 'Europe/Madrid');
}

export function entriesToDay(pages: readonly unknown[], timeZone: string): DayRangeBody {
  const tasks: Task[] = [];
  const events: ExternalEventView[] = [];
  const taskColors = new Map<string, string>();
  for (const page of pages) {
    if (typeof page !== 'object' || page === null || !('entries' in page)) continue;
    const entries = (page as { entries?: unknown }).entries;
    if (!Array.isArray(entries)) continue;
    const zone = stringField(page, 'time_zone') || timeZone;
    for (const entry of entries) {
      if (!isEntry(entry)) continue;
      if (entry.kind === 'task') {
        tasks.push(taskFromEntry(entry, zone));
        taskColors.set(entry.id, paintColor(entry.color));
      } else if (entry.kind === 'event') {
        events.push(eventFromEntry(entry));
      }
    }
  }
  return { tasks, events, taskColors };
}

interface Narrow {
  readonly value?: string;
  readonly empty: boolean;
}

function narrow(selected: readonly string[] | null, required: string | undefined): Narrow {
  if (selected !== null && selected.length === 0) {
    return { empty: true };
  }
  if (required === undefined || required.length === 0) {
    return selected === null ? { empty: false } : { value: selected.join(','), empty: false };
  }
  if (selected !== null && !selected.includes(required)) {
    return { empty: true };
  }
  return { value: required, empty: false };
}

/** `null` is every id. An empty array is an explicit empty selection (`-`). */
function csvOrNone(value: string | null): string[] | null {
  if (value === null) return null;
  if (value === '-' || value.trim().length === 0) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item !== '-');
}

function includeOf(tasks: boolean, events: boolean): 'tasks' | 'events' | undefined {
  if (tasks === events) return undefined;
  return tasks ? 'tasks' : 'events';
}

function scopeKey(request: DensityRequest): string {
  return [
    request.lists ?? '',
    request.tags ?? '',
    request.cals ?? '',
    request.include ?? '',
    request.context,
  ].join('|');
}

function summaryHeaders(etag: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const options = apiOptions();
  if (options.devUserEmail !== undefined && options.devUserEmail.length > 0) {
    headers['X-Dev-User-Email'] = options.devUserEmail;
  }
  const csrf = readCsrfToken();
  if (csrf !== undefined && csrf.length > 0) {
    headers['X-CSRF-Token'] = csrf;
  }
  if (etag !== undefined) headers['If-None-Match'] = etag;
  return headers;
}

async function fetchCalendarSummaryFresh(path: string): Promise<CalendarSummaryBody> {
  const response = await fetch(path, {
    method: 'GET',
    credentials: apiOptions().credentials ?? 'same-origin',
    cache: 'no-store',
    headers: summaryHeaders(undefined),
  });
  if (!response.ok) throw await errorOf(response);
  const body = parseSummary(await response.json());
  const etag = response.headers.get('etag');
  if (etag !== null && etag.length > 0) writeStored(path, { etag, body });
  return body;
}

async function errorOf(response: Response): Promise<ApiError> {
  const payload: unknown = await response.json().catch(() => null);
  const error =
    typeof payload === 'object' && payload !== null && 'error' in payload
      ? (payload as { error?: { code?: unknown; message?: unknown } }).error
      : undefined;
  const code = typeof error?.code === 'string' ? error.code : 'request_failed';
  const message = typeof error?.message === 'string' ? error.message : 'Request failed';
  return new ApiError(response.status, code, message);
}

function parseSummary(value: unknown): CalendarSummaryBody {
  if (typeof value !== 'object' || value === null) {
    throw new ApiError(200, 'request_failed', 'Summary does not match the API');
  }
  const row = value as {
    time_zone?: unknown;
    version?: unknown;
    granularity?: unknown;
    days?: unknown;
    truncated?: unknown;
  };
  if (
    typeof row.time_zone !== 'string' ||
    typeof row.version !== 'string' ||
    (row.granularity !== 'day' && row.granularity !== 'month') ||
    typeof row.days !== 'object' ||
    row.days === null ||
    typeof row.truncated !== 'boolean'
  ) {
    throw new ApiError(200, 'request_failed', 'Summary does not match the API');
  }
  const days: Record<string, SummaryCell> = {};
  for (const [key, cell] of Object.entries(row.days)) {
    if (typeof cell !== 'object' || cell === null) continue;
    const mark = cell as { n?: unknown; c?: unknown };
    if (typeof mark.n !== 'number' || !Array.isArray(mark.c)) continue;
    const colors = mark.c.filter((color): color is string => typeof color === 'string');
    days[key] = { n: mark.n, c: colors };
  }
  return {
    time_zone: row.time_zone,
    version: row.version,
    granularity: row.granularity,
    days,
    truncated: row.truncated,
  };
}

interface StoredSummary {
  readonly etag: string;
  readonly body: CalendarSummaryBody;
}

function readStored(path: string): StoredSummary | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + path);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const row = parsed as { etag?: unknown; body?: unknown };
    if (typeof row.etag !== 'string') return null;
    return { etag: row.etag, body: parseSummary(row.body) };
  } catch {
    return null;
  }
}

function writeStored(path: string, value: StoredSummary): void {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + path, JSON.stringify(value));
  } catch {
    /* The year still paints. The next load asks again with 200. */
  }
}

function nextCursor(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('next_cursor' in value)) return null;
  const cursor = (value as { next_cursor?: unknown }).next_cursor;
  return typeof cursor === 'string' && cursor.length > 0 ? cursor : null;
}

interface RangeEntry {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly starts_at: string;
  readonly ends_at: string | null;
  readonly all_day: boolean;
  readonly color: string;
  readonly status: string;
  readonly location?: string | null;
  readonly description?: string | null;
}

function isEntry(value: unknown): value is RangeEntry {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.kind === 'string' &&
    typeof row.title === 'string' &&
    typeof row.starts_at === 'string' &&
    (row.ends_at === null || typeof row.ends_at === 'string') &&
    typeof row.all_day === 'boolean' &&
    typeof row.color === 'string' &&
    typeof row.status === 'string'
  );
}

function taskFromEntry(entry: RangeEntry, timeZone: string): Task {
  const status = isStatus(entry.status) ? entry.status : 'active';
  return {
    id: entry.id,
    project_id: '',
    parent_id: null,
    column_id: null,
    title: entry.title,
    content: '',
    kind: 'task',
    status,
    priority: 'none',
    is_all_day: entry.all_day,
    start_date: entry.starts_at,
    due_date: entry.starts_at,
    time_zone: timeZone,
    duration_minutes: null,
    version: 1,
    is_someday: false,
    evening_only: false,
    repeat_rule: null,
    repeat_from: 'due_date',
    series_id: null,
    sort_order: '0',
    tag_ids: [],
    assignee_id: null,
    created_by: '',
    completed_at: null,
    source: 'calendar-range',
    checklist_progress: { completed: 0, total: 0 },
    created_at: entry.starts_at,
    updated_at: entry.starts_at,
    deleted_at: null,
  };
}

function eventFromEntry(entry: RangeEntry): ExternalEventView {
  return {
    id: entry.id,
    title: entry.title,
    starts_at: entry.starts_at,
    ends_at: entry.ends_at,
    is_all_day: entry.all_day,
    color: paintColor(entry.color),
    ...(entry.location === undefined || entry.location === null
      ? {}
      : { location: entry.location }),
    ...(entry.description === undefined || entry.description === null
      ? {}
      : { description: entry.description }),
  };
}

function isStatus(value: string): value is Task['status'] {
  return (
    value === 'active' || value === 'completed' || value === 'archived' || value === 'cancelled'
  );
}

function stringField(value: object, key: string): string {
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field : '';
}
