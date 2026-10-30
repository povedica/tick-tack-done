import {
  RANGE_MAX_DAYS,
  RANGE_MAX_LIMIT,
  SUMMARY_MAX_DAYS,
  decodeCalendarCursor,
  inclusiveCivilDays,
  type CalendarCursorKey,
} from '@reflexionia/domain';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../http/domain.exception.js';
import { parseWorkContext, type WorkContextMode } from '../../work/work-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ZoomInclude {
  readonly tasks: boolean;
  readonly events: boolean;
  readonly label: string;
}

export interface ZoomFilters {
  readonly from: string;
  readonly to: string;
  readonly context: WorkContextMode;
  readonly lists: readonly string[];
  readonly tags: readonly string[];
  readonly cals: readonly string[];
  readonly include: ZoomInclude;
}

export function parseZoomFilters(
  raw: {
    readonly from?: string | undefined;
    readonly to?: string | undefined;
    readonly context?: string | undefined;
    readonly lists?: string | undefined;
    readonly tags?: string | undefined;
    readonly cals?: string | undefined;
    readonly include?: string | undefined;
  },
  maxDays: number,
): ZoomFilters {
  if (
    raw.from === undefined ||
    raw.to === undefined ||
    raw.from.length === 0 ||
    raw.to.length === 0
  ) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'from and to are required civil days',
    );
  }
  const days = inclusiveCivilDays(raw.from, raw.to);
  if (days === null) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'from and to must be civil days with from on or before to',
    );
  }
  if (days > maxDays) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      `window is longer than ${String(maxDays)} days`,
    );
  }
  return {
    from: raw.from,
    to: raw.to,
    context: parseWorkContext(raw.context),
    lists: parseUuidCsv(raw.lists, 'lists'),
    tags: parseUuidCsv(raw.tags, 'tags'),
    cals: parseUuidCsv(raw.cals, 'cals'),
    include: parseZoomInclude(raw.include),
  };
}

export function parseSummaryFilters(raw: {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly granularity?: string | undefined;
  readonly context?: string | undefined;
  readonly lists?: string | undefined;
  readonly tags?: string | undefined;
  readonly cals?: string | undefined;
  readonly include?: string | undefined;
}): ZoomFilters & { readonly granularity: 'day' | 'month' } {
  return {
    ...parseZoomFilters(raw, SUMMARY_MAX_DAYS),
    granularity: parseGranularity(raw.granularity),
  };
}

export function parseRangeFilters(raw: {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly fields?: string | undefined;
  readonly include?: string | undefined;
  readonly context?: string | undefined;
  readonly lists?: string | undefined;
  readonly tags?: string | undefined;
  readonly cals?: string | undefined;
  readonly cursor?: string | undefined;
  readonly limit?: string | undefined;
}): ZoomFilters & {
  readonly fields: 'compact' | 'full';
  readonly cursor: CalendarCursorKey | null;
  readonly limit: number;
} {
  return {
    ...parseZoomFilters(raw, RANGE_MAX_DAYS),
    fields: parseFields(raw.fields),
    cursor: parseCursor(raw.cursor),
    limit: parseLimit(raw.limit),
  };
}

export function parseGranularity(raw: string | undefined): 'day' | 'month' {
  if (raw === undefined || raw.length === 0 || raw === 'day') {
    return 'day';
  }
  if (raw === 'month') {
    return 'month';
  }
  throw new DomainException(
    HttpStatus.BAD_REQUEST,
    'validation_failed',
    'granularity must be day or month',
  );
}

export function parseFields(raw: string | undefined): 'compact' | 'full' {
  if (raw === undefined || raw.length === 0 || raw === 'compact') {
    return 'compact';
  }
  if (raw === 'full') {
    return 'full';
  }
  throw new DomainException(
    HttpStatus.BAD_REQUEST,
    'validation_failed',
    'fields must be compact or full',
  );
}

export function parseLimit(raw: string | undefined): number {
  if (raw === undefined || raw.length === 0) {
    return 100;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > RANGE_MAX_LIMIT) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'limit must be an integer from 1 to 500',
    );
  }
  return value;
}

/** Projections are accepted and add no rows. F8b is not enabled. */
export function parseZoomInclude(raw: string | undefined): ZoomInclude {
  if (raw === undefined || raw.length === 0 || raw === 'all') {
    return { tasks: true, events: true, label: 'events,tasks' };
  }
  let tasks = false;
  let events = false;
  for (const part of raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)) {
    if (part === 'tasks') {
      tasks = true;
    } else if (part === 'events' || part === 'external') {
      events = true;
    } else if (part === 'projections') {
      continue;
    } else {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'include must be tasks, events or projections',
      );
    }
  }
  const label = [events ? 'events' : '', tasks ? 'tasks' : '']
    .filter((item) => item.length > 0)
    .join(',');
  return { tasks, events, label };
}

function parseCursor(raw: string | undefined): CalendarCursorKey | null {
  if (raw === undefined || raw.length === 0) {
    return null;
  }
  const key = decodeCalendarCursor(raw);
  if (key === null) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'cursor is invalid');
  }
  return key;
}

function parseUuidCsv(raw: string | undefined, name: string): string[] {
  if (raw === undefined || raw.trim().length === 0) {
    return [];
  }
  const parts = raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
  if (parts.length > 100) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      `${name} accepts at most 100 ids`,
    );
  }
  for (const part of parts) {
    if (!UUID.test(part)) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        `${name} must be uuids`,
      );
    }
  }
  return [...new Set(parts)].sort();
}
