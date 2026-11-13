import type { CalendarCursorKey } from '@reflexionia/domain';
import { Prisma } from '@prisma/client';

export interface ZoomRead {
  readonly ownerId: string;
  readonly from: string;
  readonly to: string;
  /** null = every owned list. Empty = no task. Applied before GROUP BY and before LIMIT. */
  readonly lists: readonly string[] | null;
  readonly tags: readonly string[];
  readonly cals: readonly string[];
  readonly includeTasks: boolean;
  readonly includeEvents: boolean;
  readonly workMode: 'all' | 'work' | 'personal';
  readonly workProjects: readonly string[];
  readonly workFolders: readonly string[];
  readonly workTags: readonly string[];
  readonly full: boolean;
  readonly cursor: CalendarCursorKey | null;
  readonly limit: number;
}

export function sqlText(query: Prisma.Sql): string {
  return query.strings.join('$?');
}

const TASK_COLOR = Prisma.sql`CASE WHEN p.color ~ '^#[0-9A-Fa-f]{3,8}$' THEN p.color ELSE 'accent' END`;
const EVENT_COLOR = Prisma.sql`CASE WHEN s.color ~ '^#[0-9A-Fa-f]{3,8}$' THEN s.color ELSE 'accent' END`;

/** Year/month density. Tasks are one capture day. Events expand inclusive local days. */
export function summaryQuery(query: ZoomRead): Prisma.Sql {
  return Prisma.sql`
    WITH task_days AS (${taskDays(query)}),
         event_days AS (${eventDays(query)})
    SELECT to_char(COALESCE(task_days.day, event_days.day), 'YYYY-MM-DD') AS day,
           (COALESCE(task_days.n, 0) + COALESCE(event_days.n, 0))::int AS n,
           COALESCE(task_days.n, 0)::int AS task_n,
           COALESCE(event_days.n, 0)::int AS event_n,
           COALESCE(task_days.colors, ARRAY[]::text[]) AS task_colors,
           COALESCE(event_days.color, 'accent') AS event_color,
           COALESCE(task_days.truncated, FALSE) AS task_truncated,
           COALESCE(event_days.truncated, FALSE) AS event_truncated,
           COALESCE(event_days.mixed, FALSE) AS event_mixed
    FROM task_days
    FULL OUTER JOIN event_days ON task_days.day = event_days.day
    WHERE COALESCE(task_days.n, 0) + COALESCE(event_days.n, 0) > 0
  `;
}

/** Keyset page. The list predicate is inside the task branch, before ORDER BY and LIMIT. */
export function rangeQuery(query: ZoomRead): Prisma.Sql {
  return Prisma.sql`
    SELECT page.kind,
           page.id::text AS id,
           page.source_id::text AS source_id,
           page.title,
           to_char(page.local_start_day, 'YYYY-MM-DD') AS local_start_day,
           to_char(page.local_end_day, 'YYYY-MM-DD') AS local_end_day,
           to_char(page.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS starts_at,
           CASE
             WHEN page.ends_at IS NULL THEN NULL
             ELSE to_char(page.ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
           END AS ends_at,
           page.all_day,
           page.color,
           page.status,
           page.content,
           page.location,
           page.description
    FROM (
      ${taskBranch(query)}
      UNION ALL
      ${eventBranch(query)}
    ) page
    WHERE ${cursorPredicate(query.cursor)}
    ORDER BY page.local_start_day, page.starts_at, page.id
    LIMIT ${query.limit + 1}
  `;
}

/** Every id in the window, for the seed cursor check. Same predicates as the page, no keyset. */
export function rangeIdQuery(query: ZoomRead): Prisma.Sql {
  return Prisma.sql`
    SELECT page.id::text AS id
    FROM (
      ${taskBranch(query)}
      UNION ALL
      ${eventBranch(query)}
    ) page
  `;
}

function taskDays(query: ZoomRead): Prisma.Sql {
  if (!query.includeTasks) {
    return Prisma.sql`
      SELECT NULL::date AS day, 0::int AS n, ARRAY[]::text[] AS colors, FALSE AS truncated
      WHERE FALSE
    `;
  }
  return Prisma.sql`
    SELECT grouped.day,
           sum(grouped.n)::int AS n,
           (array_agg(grouped.color ORDER BY grouped.color))[1:3] AS colors,
           (count(*) > 3) AS truncated
    FROM (
      SELECT t.local_start_day AS day,
             count(*)::int AS n,
             ${TASK_COLOR} AS color
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE ${taskPredicate(query, 'mark')}
      GROUP BY t.local_start_day, 3
    ) grouped
    GROUP BY grouped.day
  `;
}

function eventDays(query: ZoomRead): Prisma.Sql {
  if (!query.includeEvents) {
    return Prisma.sql`
      SELECT NULL::date AS day,
             0::int AS n,
             NULL::text AS color,
             FALSE AS truncated,
             FALSE AS mixed
      WHERE FALSE
    `;
  }
  return Prisma.sql`
    WITH subs AS MATERIALIZED (
      ${visibleSubscriptions(query)}
    )
    SELECT marks.day,
           sum(marks.n)::int AS n,
           min(subs.color) AS color,
           (sum(marks.n) > 8) AS truncated,
           (count(DISTINCT marks.subscription_id) > 1) AS mixed
    FROM (
      SELECT e.local_start_day AS day, e.subscription_id, count(*)::int AS n
      FROM external_events e
      WHERE ${eventOwner(query)}
        AND e.local_start_day = e.local_end_day
        AND e.local_start_day BETWEEN CAST(${query.from} AS date) AND CAST(${query.to} AS date)
      GROUP BY e.local_start_day, e.subscription_id
      UNION ALL
      SELECT gs.day::date AS day, e.subscription_id, count(*)::int AS n
      FROM external_events e
      CROSS JOIN LATERAL generate_series(
        GREATEST(e.local_start_day, CAST(${query.from} AS date)),
        LEAST(e.local_end_day, CAST(${query.to} AS date)),
        interval '1 day'
      ) AS gs(day)
      WHERE ${eventOwner(query)}
        AND e.local_start_day < e.local_end_day
        AND e.local_start_day <= CAST(${query.to} AS date)
        AND e.local_end_day >= CAST(${query.from} AS date)
      GROUP BY gs.day, e.subscription_id
    ) marks
    JOIN subs ON subs.id = marks.subscription_id
    GROUP BY marks.day
  `;
}

/** Ordered event colors for days that mix more than one visible subscription. */
export function mixedEventColors(query: ZoomRead, days: readonly string[]): Prisma.Sql {
  const wanted = dateArray(days);
  return Prisma.sql`
    SELECT to_char(marks.day, 'YYYY-MM-DD') AS day,
           (array_agg(marks.color ORDER BY marks.starts_at, marks.id))[1:8] AS colors
    FROM (${eventMarks(query, true)}) marks
    WHERE marks.day = ANY(${wanted})
    GROUP BY marks.day
  `;
}

function eventMarks(query: ZoomRead, ordered: boolean): Prisma.Sql {
  const orderColumns = ordered ? Prisma.sql`e.starts_at, e.id,` : Prisma.sql``;
  return Prisma.sql`
    WITH subs AS MATERIALIZED (
      ${visibleSubscriptions(query)}
    )
    SELECT e.local_start_day AS day, ${orderColumns} e.subscription_id, subs.color
    FROM external_events e
    JOIN subs ON subs.id = e.subscription_id
    WHERE ${eventOwner(query)}
      AND e.local_start_day = e.local_end_day
      AND e.local_start_day BETWEEN CAST(${query.from} AS date) AND CAST(${query.to} AS date)
    UNION ALL
    SELECT gs.day::date AS day, ${orderColumns} e.subscription_id, subs.color
    FROM external_events e
    JOIN subs ON subs.id = e.subscription_id
    CROSS JOIN LATERAL generate_series(
      GREATEST(e.local_start_day, CAST(${query.from} AS date)),
      LEAST(e.local_end_day, CAST(${query.to} AS date)),
      interval '1 day'
    ) AS gs(day)
    WHERE ${eventOwner(query)}
      AND e.local_start_day < e.local_end_day
      AND e.local_start_day <= CAST(${query.to} AS date)
      AND e.local_end_day >= CAST(${query.from} AS date)
  `;
}

function visibleSubscriptions(query: ZoomRead): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`s.owner_id = CAST(${query.ownerId} AS uuid)`,
    Prisma.sql`s.deleted_at IS NULL`,
    Prisma.sql`s.visible = TRUE`,
  ];
  if (query.cals.length > 0) {
    parts.push(Prisma.sql`s.id = ANY(${uuidArray(query.cals)})`);
  }
  return Prisma.sql`
    SELECT s.id,
           CASE WHEN s.color ~ '^#[0-9A-Fa-f]{3,8}$' THEN s.color ELSE 'accent' END AS color
    FROM calendar_subscriptions s
    WHERE ${Prisma.join(parts, ' AND ')}
  `;
}

function eventOwner(query: ZoomRead): Prisma.Sql {
  return Prisma.sql`
    e.owner_id = CAST(${query.ownerId} AS uuid)
    AND e.deleted_at IS NULL
    AND e.local_start_day IS NOT NULL
    AND e.local_end_day IS NOT NULL
  `;
}

function dateArray(days: readonly string[]): Prisma.Sql {
  if (days.length === 0) {
    return Prisma.sql`ARRAY[]::date[]`;
  }
  return Prisma.sql`ARRAY[${Prisma.join(
    days.map((day) => Prisma.sql`CAST(${day} AS date)`),
  )}]::date[]`;
}

function taskBranch(query: ZoomRead): Prisma.Sql {
  const content = query.full ? Prisma.sql`t.content` : Prisma.sql`NULL::text`;
  if (!query.includeTasks) {
    return emptyBranch();
  }
  return Prisma.sql`
    SELECT 'task'::text AS kind,
           t.id,
           t.id AS source_id,
           t.title,
           t.local_start_day,
           t.local_end_day,
           COALESCE(t.start_date, t.due_date) AS starts_at,
           t.due_date AS ends_at,
           t.is_all_day AS all_day,
           ${TASK_COLOR} AS color,
           t.status::text AS status,
           ${content} AS content,
           NULL::text AS location,
           NULL::text AS description
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE ${taskPredicate(query, 'overlap')}
  `;
}

function eventBranch(query: ZoomRead): Prisma.Sql {
  if (!query.includeEvents) {
    return emptyBranch();
  }
  const location = query.full ? Prisma.sql`e.location` : Prisma.sql`NULL::text`;
  const description = query.full ? Prisma.sql`e.description` : Prisma.sql`NULL::text`;
  return Prisma.sql`
    SELECT 'event'::text AS kind,
           e.id,
           e.id AS source_id,
           e.title,
           e.local_start_day,
           e.local_end_day,
           e.starts_at,
           e.ends_at,
           e.is_all_day AS all_day,
           ${EVENT_COLOR} AS color,
           e.status,
           NULL::text AS content,
           ${location} AS location,
           ${description} AS description
    FROM external_events e
    JOIN calendar_subscriptions s ON s.id = e.subscription_id
    WHERE ${eventPredicate(query)}
  `;
}

function emptyBranch(): Prisma.Sql {
  return Prisma.sql`
    SELECT NULL::text AS kind,
           NULL::uuid AS id,
           NULL::uuid AS source_id,
           NULL::text AS title,
           NULL::date AS local_start_day,
           NULL::date AS local_end_day,
           NULL::timestamptz AS starts_at,
           NULL::timestamptz AS ends_at,
           NULL::boolean AS all_day,
           NULL::text AS color,
           NULL::text AS status,
           NULL::text AS content,
           NULL::text AS location,
           NULL::text AS description
    WHERE FALSE
  `;
}

function taskPredicate(query: ZoomRead, span: 'mark' | 'overlap'): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`t.owner_id = CAST(${query.ownerId} AS uuid)`,
    Prisma.sql`t.deleted_at IS NULL`,
    Prisma.sql`t.status = 'active'::"TaskStatus"`,
    Prisma.sql`t.local_start_day IS NOT NULL`,
    Prisma.sql`t.local_end_day IS NOT NULL`,
    Prisma.sql`COALESCE(t.start_date, t.due_date) IS NOT NULL`,
  ];
  if (span === 'mark') {
    parts.push(
      Prisma.sql`t.local_start_day BETWEEN CAST(${query.from} AS date) AND CAST(${query.to} AS date)`,
    );
  } else {
    parts.push(Prisma.sql`t.local_start_day <= CAST(${query.to} AS date)`);
    parts.push(Prisma.sql`t.local_end_day >= CAST(${query.from} AS date)`);
  }
  parts.push(listPredicate(query.lists));
  if (query.tags.length > 0) {
    parts.push(Prisma.sql`EXISTS (
      SELECT 1 FROM task_tags tt
      WHERE tt.task_id = t.id AND tt.tag_id = ANY(${uuidArray(query.tags)})
    )`);
  }
  parts.push(workPredicate(query));
  return Prisma.join(parts, ' AND ');
}

/** External events are not lists. A token listIds filter must not reach this predicate. */
function eventPredicate(query: ZoomRead): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`e.owner_id = CAST(${query.ownerId} AS uuid)`,
    Prisma.sql`e.deleted_at IS NULL`,
    Prisma.sql`e.local_start_day IS NOT NULL`,
    Prisma.sql`e.local_end_day IS NOT NULL`,
    Prisma.sql`s.deleted_at IS NULL`,
    Prisma.sql`s.visible = TRUE`,
    Prisma.sql`e.local_start_day <= CAST(${query.to} AS date)`,
    Prisma.sql`e.local_end_day >= CAST(${query.from} AS date)`,
  ];
  if (query.cals.length > 0) {
    parts.push(Prisma.sql`e.subscription_id = ANY(${uuidArray(query.cals)})`);
  }
  return Prisma.join(parts, ' AND ');
}

function listPredicate(lists: readonly string[] | null): Prisma.Sql {
  if (lists === null) {
    return Prisma.sql`TRUE`;
  }
  if (lists.length === 0) {
    return Prisma.sql`FALSE`;
  }
  return Prisma.sql`t.project_id = ANY(${uuidArray(lists)})`;
}

function workPredicate(query: ZoomRead): Prisma.Sql {
  if (query.workMode === 'all') {
    return Prisma.sql`TRUE`;
  }
  if (query.workMode === 'work') {
    return workMatch(query);
  }
  return personalMatch(query);
}

function workMatch(query: ZoomRead): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (query.workProjects.length > 0) {
    parts.push(Prisma.sql`t.project_id = ANY(${uuidArray(query.workProjects)})`);
  }
  if (query.workFolders.length > 0) {
    parts.push(Prisma.sql`p.folder_id = ANY(${uuidArray(query.workFolders)})`);
  }
  if (query.workTags.length > 0) {
    parts.push(Prisma.sql`EXISTS (
      SELECT 1 FROM task_tags tt
      WHERE tt.task_id = t.id AND tt.tag_id = ANY(${uuidArray(query.workTags)})
    )`);
  }
  if (parts.length === 0) {
    return Prisma.sql`FALSE`;
  }
  return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
}

function personalMatch(query: ZoomRead): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (query.workProjects.length > 0) {
    parts.push(Prisma.sql`t.project_id <> ALL(${uuidArray(query.workProjects)})`);
  }
  if (query.workFolders.length > 0) {
    parts.push(
      Prisma.sql`(p.folder_id IS NULL OR p.folder_id <> ALL(${uuidArray(query.workFolders)}))`,
    );
  }
  if (query.workTags.length > 0) {
    parts.push(Prisma.sql`NOT EXISTS (
      SELECT 1 FROM task_tags tt
      WHERE tt.task_id = t.id AND tt.tag_id = ANY(${uuidArray(query.workTags)})
    )`);
  }
  if (parts.length === 0) {
    return Prisma.sql`TRUE`;
  }
  return Prisma.sql`(${Prisma.join(parts, ' AND ')})`;
}

function cursorPredicate(cursor: CalendarCursorKey | null): Prisma.Sql {
  if (cursor === null) {
    return Prisma.sql`TRUE`;
  }
  return Prisma.sql`(page.local_start_day, page.starts_at, page.id) > (
    CAST(${cursor.day} AS date),
    CAST(${cursor.startsAt} AS timestamptz),
    CAST(${cursor.id} AS uuid)
  )`;
}

function uuidArray(ids: readonly string[]): Prisma.Sql {
  if (ids.length === 0) {
    return Prisma.sql`ARRAY[]::uuid[]`;
  }
  return Prisma.sql`ARRAY[${Prisma.join(ids)}]::uuid[]`;
}
