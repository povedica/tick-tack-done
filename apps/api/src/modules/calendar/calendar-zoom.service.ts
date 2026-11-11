import { createHash } from 'node:crypto';
import {
  authorizedLists,
  calendarScopeKey,
  encodeCalendarCursor,
  listScopeKey,
  zoomDensity,
  type CalendarScope,
  type ZoomMark,
} from '@reflexionia/domain';
import { Inject, Injectable } from '@nestjs/common';
import type { AuthUser } from '../../auth/auth-user.js';
import { matchesEtag } from '../../http/cursor.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { loadWorkRow, resolvedWorkMode, type WorkContextMode } from '../../work/work-context.js';
import { workHiddenNow } from '@reflexionia/domain';
import { readCalendarVersion } from './calendar-version.js';
import { parseRangeFilters, parseSummaryFilters, type ZoomInclude } from './calendar-zoom.parse.js';
import { mixedEventColors, rangeQuery, summaryQuery, type ZoomRead } from './calendar-zoom.sql.js';

export interface ZoomResult<T> {
  readonly etag: string;
  readonly body: T | null;
}

interface SummaryBody {
  readonly time_zone: string;
  readonly version: string;
  readonly granularity: 'day' | 'month';
  readonly days: Readonly<Record<string, { readonly n: number; readonly c: readonly string[] }>>;
  readonly truncated: boolean;
}

interface RangeBody {
  readonly time_zone: string;
  readonly version: string;
  readonly entries: readonly RangeEntry[];
  readonly next_cursor: string | null;
}

interface RangeEntry {
  readonly id: string;
  readonly kind: string;
  readonly source_id: string;
  readonly title: string;
  readonly local_start_day: string;
  readonly local_end_day: string;
  readonly starts_at: string;
  readonly ends_at: string | null;
  readonly all_day: boolean;
  readonly color: string;
  readonly status: string;
  readonly content?: string | null;
  readonly location?: string | null;
  readonly description?: string | null;
}

interface SummaryRow {
  day: string;
  n: number;
  task_n: number;
  event_n: number;
  task_colors: string[] | null;
  event_color: string | null;
  event_colors?: string[];
  task_truncated: boolean;
  event_truncated: boolean;
  event_mixed: boolean;
}

interface RangeRow {
  kind: string;
  id: string;
  source_id: string;
  title: string;
  local_start_day: string;
  local_end_day: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  color: string;
  status: string;
  content: string | null;
  location: string | null;
  description: string | null;
}

interface WorkAudience {
  readonly mode: 'all' | 'work' | 'personal';
  readonly projects: readonly string[];
  readonly folders: readonly string[];
  readonly tags: readonly string[];
}

@Injectable()
export class CalendarZoomService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async summary(
    user: AuthUser,
    raw: {
      readonly from?: string | undefined;
      readonly to?: string | undefined;
      readonly granularity?: string | undefined;
      readonly context?: string | undefined;
      readonly lists?: string | undefined;
      readonly tags?: string | undefined;
      readonly cals?: string | undefined;
      readonly include?: string | undefined;
    },
    ifNoneMatch?: string,
  ): Promise<ZoomResult<SummaryBody>> {
    const parsed = parseSummaryFilters(raw);
    const work = await this.workAudience(user.id, parsed.context);
    const lists = authorizedLists(user.listIds, parsed.lists);
    const version = await readCalendarVersion(this.prisma, user.id);
    const scope = this.scope(user, parsed, work, lists, 'summary', parsed.granularity, '');
    const etag = representationEtag(version, scope);
    if (matchesEtag(ifNoneMatch, etag)) {
      return { etag, body: null };
    }
    const read = this.read(user, parsed, work, lists, false, null, 0);
    const rows = await this.prisma.$queryRaw<SummaryRow[]>(summaryQuery(read));
    paintSingleCalendarColors(rows);
    await this.fillMixedEventColors(read, rows);
    const density = zoomDensity(rows.map(markOf), parsed.granularity);
    return {
      etag,
      body: {
        time_zone: user.timeZone,
        version: version.toString(),
        granularity: parsed.granularity,
        days: density.cells,
        truncated: density.truncated,
      },
    };
  }

  async range(
    user: AuthUser,
    raw: {
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
    },
    ifNoneMatch?: string,
  ): Promise<ZoomResult<RangeBody>> {
    const parsed = parseRangeFilters(raw);
    const work = await this.workAudience(user.id, parsed.context);
    const lists = authorizedLists(user.listIds, parsed.lists);
    const version = await readCalendarVersion(this.prisma, user.id);
    const cursorKey = parsed.cursor === null ? '' : encodeCalendarCursor(parsed.cursor);
    const scope = this.scope(user, parsed, work, lists, 'range', parsed.fields, cursorKey);
    const etag = representationEtag(version, scope);
    if (matchesEtag(ifNoneMatch, etag)) {
      return { etag, body: null };
    }
    const rows = await this.prisma.$queryRaw<RangeRow[]>(
      rangeQuery(
        this.read(user, parsed, work, lists, parsed.fields === 'full', parsed.cursor, parsed.limit),
      ),
    );
    const hasMore = rows.length > parsed.limit;
    const page = hasMore ? rows.slice(0, parsed.limit) : rows;
    const last = page.at(-1);
    const next =
      hasMore && last !== undefined
        ? encodeCalendarCursor({
            day: last.local_start_day,
            startsAt: last.starts_at,
            id: last.id,
          })
        : null;
    return {
      etag,
      body: {
        time_zone: user.timeZone,
        version: version.toString(),
        entries: page.map((row) => entryOf(row, parsed.fields === 'full')),
        next_cursor: next,
      },
    };
  }

  private async fillMixedEventColors(read: ZoomRead, rows: SummaryRow[]): Promise<void> {
    const days = rows.filter((row) => row.event_mixed).map((row) => row.day);
    if (days.length === 0) {
      return;
    }
    const colors = await this.prisma.$queryRaw<{ day: string; colors: string[] | null }[]>(
      mixedEventColors(read, days),
    );
    const byDay = new Map(colors.map((row) => [row.day, row.colors ?? []]));
    for (const row of rows) {
      if (row.event_mixed) {
        row.event_colors = byDay.get(row.day) ?? [];
      }
    }
  }

  private scope(
    user: AuthUser,
    parsed: {
      readonly from: string;
      readonly to: string;
      readonly context: WorkContextMode;
      readonly tags: readonly string[];
      readonly cals: readonly string[];
      readonly include: ZoomInclude;
    },
    work: WorkAudience,
    lists: readonly string[] | null,
    kind: 'summary' | 'range',
    grain: string,
    cursor: string,
  ): CalendarScope {
    const requested = lists === null ? '*' : lists.join(',');
    return {
      kind,
      from: parsed.from,
      to: parsed.to,
      zone: user.timeZone,
      context: parsed.context,
      workMode: work.mode,
      workProjects: work.projects,
      workFolders: work.folders,
      workTags: work.tags,
      lists: `${listScopeKey(user.listIds)}|${requested}`,
      tokenId: user.tokenId ?? 'session',
      tags: parsed.tags,
      cals: parsed.cals,
      include: parsed.include.label,
      grain,
      cursor,
    };
  }

  private read(
    user: AuthUser,
    parsed: {
      readonly from: string;
      readonly to: string;
      readonly tags: readonly string[];
      readonly cals: readonly string[];
      readonly include: ZoomInclude;
    },
    work: WorkAudience,
    lists: readonly string[] | null,
    full: boolean,
    cursor: ZoomRead['cursor'],
    limit: number,
  ): ZoomRead {
    return {
      ownerId: user.id,
      from: parsed.from,
      to: parsed.to,
      lists,
      tags: parsed.tags,
      cals: parsed.cals,
      includeTasks: parsed.include.tasks,
      includeEvents: parsed.include.events,
      workMode: work.mode,
      workProjects: work.projects,
      workFolders: work.folders,
      workTags: work.tags,
      full,
      cursor,
      limit,
    };
  }

  private async workAudience(ownerId: string, context: WorkContextMode): Promise<WorkAudience> {
    if (context === 'all') {
      return { mode: 'all', projects: [], folders: [], tags: [] };
    }
    const row = await loadWorkRow(this.prisma, ownerId);
    const hidden = workHiddenNow(
      {
        start: row.workDayStart,
        end: row.workDayEnd,
        days: row.workDays,
        hideWorkOutsideHours: row.hideWorkOutsideHours,
        showWorkUntil: row.showWorkUntil?.toISOString() ?? null,
        timeZone: row.timeZone,
      },
      new Date().toISOString(),
    );
    return {
      mode: resolvedWorkMode(context, hidden),
      projects: [...row.workProjectIds].sort(),
      folders: [...row.workFolderIds].sort(),
      tags: [...row.workTagIds].sort(),
    };
  }
}

export function representationEtag(version: bigint, scope: CalendarScope): string {
  const hash = createHash('sha256').update(calendarScopeKey(scope)).digest('base64url');
  return `W/"v${version.toString()}-${hash}"`;
}

function paintSingleCalendarColors(rows: SummaryRow[]): void {
  for (const row of rows) {
    if (row.event_mixed || row.event_n === 0) {
      continue;
    }
    const copies = Math.min(row.event_n, 8);
    const color = row.event_color ?? 'accent';
    row.event_colors = Array.from({ length: copies }, () => color);
  }
}

function markOf(row: SummaryRow): ZoomMark {
  return {
    key: row.day,
    taskCount: row.task_n,
    eventCount: row.event_n,
    taskColors: row.task_colors ?? [],
    eventColors: row.event_colors ?? [],
    taskTruncated: row.task_truncated,
    eventTruncated: row.event_truncated,
  };
}

function entryOf(row: RangeRow, full: boolean): RangeEntry {
  const base: RangeEntry = {
    id: row.id,
    kind: row.kind,
    source_id: row.source_id,
    title: row.title,
    local_start_day: row.local_start_day,
    local_end_day: row.local_end_day,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    all_day: row.all_day,
    color: row.color,
    status: row.status,
  };
  if (!full) {
    return base;
  }
  return {
    ...base,
    content: row.content,
    location: row.location,
    description: row.description,
  };
}
