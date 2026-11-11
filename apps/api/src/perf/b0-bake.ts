/** Section 6.2 budgets for the two reads F6 will serve. A tie stays on B0. */
export const BAKE_P95_MS = 50;
export const BAKE_P99_MS = 200;
export const BAKE_RUNS = 20;
export const YEAR_FROM = '2026-01-01';
export const YEAR_TO = '2026-12-31';
export const RANGE_PAGE = 500;

export interface BakeSample {
  readonly p95: number;
  readonly p99: number;
}

export interface BakeTimes {
  readonly summary: BakeSample;
  readonly range: BakeSample;
}

/** B0 is the choice when both source-table reads meet the budget. */
export function bakeChoice(source: BakeTimes): 'B0' | 'over-budget' {
  const within = (sample: BakeSample): boolean =>
    sample.p95 < BAKE_P95_MS && sample.p99 < BAKE_P99_MS;
  return within(source.summary) && within(source.range) ? 'B0' : 'over-budget';
}

/** Nearest-rank percentile. `values` must already be sorted ascending. */
export function percentile(values: readonly number[], rank: number): number {
  if (values.length === 0 || rank <= 0 || rank > 100) {
    throw new Error('percentile needs samples and a rank between 1 and 100');
  }
  const index = Math.ceil((rank / 100) * values.length) - 1;
  const value = values[Math.max(0, index)];
  if (value === undefined) {
    throw new Error('percentile missed the sample');
  }
  return value;
}

export function bakeSample(millis: readonly number[]): BakeSample {
  const sorted = [...millis].sort((left, right) => left - right);
  return { p95: percentile(sorted, 95), p99: percentile(sorted, 99) };
}

export interface ExplainTiming {
  readonly planningMs: number;
  readonly executionMs: number;
  readonly totalMs: number;
  readonly indexes: readonly string[];
  readonly sharedHitBlocks: number | null;
}

/** Planning plus execution, which is what one API query pays inside Postgres. */
export function explainTiming(payload: unknown): ExplainTiming {
  const root = explainRoot(payload);
  const planningMs = numberField(root, 'Planning Time');
  const executionMs = numberField(root, 'Execution Time');
  const indexes: string[] = [];
  let sharedHitBlocks: number | null = null;
  visitPlan(root.Plan, (node) => {
    if (typeof node['Index Name'] === 'string') {
      indexes.push(node['Index Name']);
    }
    if (typeof node['Shared Hit Blocks'] === 'number' && sharedHitBlocks === null) {
      sharedHitBlocks = node['Shared Hit Blocks'];
    }
  });
  return {
    planningMs,
    executionMs,
    totalMs: planningMs + executionMs,
    indexes,
    sharedHitBlocks,
  };
}

export interface BakeSql {
  readonly text: string;
  readonly values: readonly unknown[];
}

/**
 * Year summary at day grain. Tasks mark one capture day. Events expand
 * [local_start_day, local_end_day]. The task side joins the project color.
 */
export function summarySql(store: 'source' | 'bake', ownerId: string): BakeSql {
  const values = [ownerId, YEAR_FROM, YEAR_TO];
  if (store === 'source') {
    return {
      values,
      text: `
        WITH bounds AS (
          SELECT $2::date AS from_day, $3::date AS to_day
        ),
        task_days AS (
          SELECT t.local_start_day AS day,
                 count(*)::int AS n,
                 count(DISTINCT p.color)::int AS colors
          FROM tasks t
          LEFT JOIN projects p ON p.id = t.project_id
          WHERE t.owner_id = $1::uuid
            AND t.deleted_at IS NULL
            AND t.local_start_day BETWEEN (SELECT from_day FROM bounds) AND (SELECT to_day FROM bounds)
          GROUP BY t.local_start_day
        ),
        event_days AS (
          SELECT gs.day::date AS day, count(*)::int AS n
          FROM external_events e
          CROSS JOIN LATERAL generate_series(
            GREATEST(e.local_start_day, (SELECT from_day FROM bounds)),
            LEAST(e.local_end_day, (SELECT to_day FROM bounds)),
            interval '1 day'
          ) AS gs(day)
          WHERE e.owner_id = $1::uuid
            AND e.deleted_at IS NULL
            AND e.local_start_day <= (SELECT to_day FROM bounds)
            AND e.local_end_day >= (SELECT from_day FROM bounds)
          GROUP BY gs.day
        )
        SELECT d.day::date AS day,
               COALESCE(task_days.n, 0) AS tasks,
               COALESCE(task_days.colors, 0) AS colors,
               COALESCE(event_days.n, 0) AS events
        FROM generate_series(
          (SELECT from_day FROM bounds),
          (SELECT to_day FROM bounds),
          interval '1 day'
        ) AS d(day)
        LEFT JOIN task_days ON task_days.day = d.day::date
        LEFT JOIN event_days ON event_days.day = d.day::date
      `,
    };
  }
  return {
    values,
    text: `
      WITH bounds AS (
        SELECT $2::date AS from_day, $3::date AS to_day
      ),
      task_days AS (
        SELECT e.local_start_day AS day,
               count(*)::int AS n,
               count(DISTINCT e.color)::int AS colors
        FROM calendar_entries_bake e
        WHERE e.owner_id = $1::uuid
          AND e.kind = 'task'
          AND e.local_start_day BETWEEN (SELECT from_day FROM bounds) AND (SELECT to_day FROM bounds)
        GROUP BY e.local_start_day
      ),
      event_days AS (
        SELECT gs.day::date AS day, count(*)::int AS n
        FROM calendar_entries_bake e
        CROSS JOIN LATERAL generate_series(
          GREATEST(e.local_start_day, (SELECT from_day FROM bounds)),
          LEAST(e.local_end_day, (SELECT to_day FROM bounds)),
          interval '1 day'
        ) AS gs(day)
        WHERE e.owner_id = $1::uuid
          AND e.kind = 'event'
          AND e.local_start_day <= (SELECT to_day FROM bounds)
          AND e.local_end_day >= (SELECT from_day FROM bounds)
        GROUP BY gs.day
      )
      SELECT d.day::date AS day,
             COALESCE(task_days.n, 0) AS tasks,
             COALESCE(task_days.colors, 0) AS colors,
             COALESCE(event_days.n, 0) AS events
      FROM generate_series(
        (SELECT from_day FROM bounds),
        (SELECT to_day FROM bounds),
        interval '1 day'
      ) AS d(day)
      LEFT JOIN task_days ON task_days.day = d.day::date
      LEFT JOIN event_days ON event_days.day = d.day::date
    `,
  };
}

/** First page of a month. Keyset order is (local_start_day, starts_at, id). */
export function rangeSql(
  store: 'source' | 'bake',
  ownerId: string,
  fromDay: string,
  toDay: string,
): BakeSql {
  const values = [ownerId, fromDay, toDay, RANGE_PAGE];
  if (store === 'source') {
    return {
      values,
      text: `
        SELECT kind, id, title, local_start_day, local_end_day, starts_at, color
        FROM (
          SELECT 'task'::text AS kind,
                 t.id,
                 t.title,
                 t.local_start_day,
                 t.local_end_day,
                 COALESCE(t.start_date, t.due_date) AS starts_at,
                 p.color
          FROM tasks t
          LEFT JOIN projects p ON p.id = t.project_id
          WHERE t.owner_id = $1::uuid
            AND t.deleted_at IS NULL
            AND t.local_start_day <= $3::date
            AND t.local_end_day >= $2::date
          UNION ALL
          SELECT 'event'::text,
                 e.id,
                 e.title,
                 e.local_start_day,
                 e.local_end_day,
                 e.starts_at,
                 NULL::text
          FROM external_events e
          WHERE e.owner_id = $1::uuid
            AND e.deleted_at IS NULL
            AND e.local_start_day <= $3::date
            AND e.local_end_day >= $2::date
        ) page
        ORDER BY local_start_day, starts_at, id
        LIMIT $4::int
      `,
    };
  }
  return {
    values,
    text: `
      SELECT kind, source_id AS id, title, local_start_day, local_end_day, starts_at, color
      FROM calendar_entries_bake
      WHERE owner_id = $1::uuid
        AND local_start_day <= $3::date
        AND local_end_day >= $2::date
      ORDER BY local_start_day, starts_at, source_id
      LIMIT $4::int
    `,
  };
}

export function explainSql(query: BakeSql): BakeSql {
  return {
    values: query.values,
    text: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.text}`,
  };
}

export function actualRows(payload: unknown): number {
  const plan = explainRoot(payload).Plan;
  if (typeof plan !== 'object' || plan === null) {
    return 0;
  }
  const row = plan as Record<string, unknown>;
  const rows = row['Actual Rows'];
  const loops = row['Actual Loops'];
  if (typeof rows !== 'number') {
    return 0;
  }
  return rows * (typeof loops === 'number' && loops > 0 ? loops : 1);
}

function explainRoot(payload: unknown): Record<string, unknown> {
  const parsed: unknown = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const root: unknown = Array.isArray(parsed) ? parsed[0] : parsed;
  if (typeof root !== 'object' || root === null) {
    throw new Error('EXPLAIN JSON has no root');
  }
  return root as Record<string, unknown>;
}

function numberField(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`EXPLAIN JSON is missing ${key}`);
  }
  return value;
}

function visitPlan(node: unknown, visit: (row: Record<string, unknown>) => void): void {
  if (typeof node !== 'object' || node === null) {
    return;
  }
  const row = node as Record<string, unknown>;
  visit(row);
  const children = row.Plans;
  if (Array.isArray(children)) {
    for (const child of children) {
      visitPlan(child, visit);
    }
  }
}
