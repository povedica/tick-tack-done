import { PrismaClient } from '@prisma/client';
import { assertEphemeralDatabase, PERF_YEAR } from './fixture.js';
import {
  BAKE_RUNS,
  bakeChoice,
  bakeSample,
  actualRows,
  explainSql,
  explainTiming,
  rangeSql,
  summarySql,
  YEAR_FROM,
  YEAR_TO,
  type BakeSql,
  type ExplainTiming,
} from './b0-bake.js';

const WARMUP = 3;
const SEED_EMAIL = 'perf-seed@example.test';

interface QueryReport {
  readonly rows: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly indexes: readonly string[];
  readonly sharedHitBlocks: number | null;
}

interface StoreReport {
  readonly summary: QueryReport;
  readonly range: QueryReport;
  readonly month: string;
  readonly monthRows: number;
}

/**
 * Times the year summary and one month page on the disposable x100 seed.
 * The bake table exists only for this process and is dropped before exit.
 * It does not change the public calendar read.
 */
export async function measureBake(databaseUrl: string): Promise<void> {
  assertEphemeralDatabase(databaseUrl, process.env.PERF_SEED);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await prisma.$executeRawUnsafe('ANALYZE tasks');
    await prisma.$executeRawUnsafe('ANALYZE external_events');
    await prisma.$executeRawUnsafe('ANALYZE projects');
    const owner = await prisma.user.findUnique({
      where: { email: SEED_EMAIL },
      select: { id: true },
    });
    if (owner === null) {
      throw new Error('b0 bake: seed the x100 profile before measuring');
    }
    await assertLocalDays(prisma, owner.id);
    const month = await busiestMonth(prisma, owner.id);
    const source = await timeStore(prisma, 'source', owner.id, month);
    await fillBake(prisma, owner.id);
    try {
      const bake = await timeStore(prisma, 'bake', owner.id, month);
      const choice = bakeChoice(source);
      const report = {
        year: PERF_YEAR,
        runs: BAKE_RUNS,
        choice,
        source,
        bake,
        note:
          choice === 'B0'
            ? 'Source tables meet the budget. The read model stays unbuilt.'
            : 'Source tables miss the budget. The bake table is only a measurement.',
      };
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } finally {
      await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS calendar_entries_bake');
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function assertLocalDays(prisma: PrismaClient, ownerId: string): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<{ missing: number }[]>(
    `
      SELECT (
        (SELECT count(*) FROM tasks
          WHERE owner_id = $1::uuid AND deleted_at IS NULL
            AND (local_start_day IS NULL OR local_end_day IS NULL))
        +
        (SELECT count(*) FROM external_events
          WHERE owner_id = $1::uuid AND deleted_at IS NULL
            AND (local_start_day IS NULL OR local_end_day IS NULL))
      )::int AS missing
    `,
    ownerId,
  );
  const missing = rows[0]?.missing ?? 0;
  if (missing !== 0) {
    throw new Error(`b0 bake: ${String(missing)} live rows have no local day`);
  }
}

function dayText(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value.slice(0, 10);
}

async function busiestMonth(
  prisma: PrismaClient,
  ownerId: string,
): Promise<{ from: string; to: string; rows: number }> {
  const rows = await prisma.$queryRawUnsafe<{ month: Date | string; rows: number }[]>(
    `
      SELECT month, count(*)::int AS rows
      FROM (
        SELECT date_trunc('month', local_start_day)::date AS month
        FROM tasks
        WHERE owner_id = $1::uuid AND deleted_at IS NULL
          AND local_start_day BETWEEN $2::date AND $3::date
        UNION ALL
        SELECT date_trunc('month', local_start_day)::date
        FROM external_events
        WHERE owner_id = $1::uuid AND deleted_at IS NULL
          AND local_start_day BETWEEN $2::date AND $3::date
      ) marks
      GROUP BY month
      ORDER BY count(*) DESC, month
      LIMIT 1
    `,
    ownerId,
    YEAR_FROM,
    YEAR_TO,
  );
  const found = rows[0];
  if (found === undefined) {
    throw new Error('b0 bake: the seed has no local days in the year');
  }
  const from = dayText(found.month);
  const [yearText, monthText] = from.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const next = new Date(Date.UTC(year, month, 1));
  const to = new Date(next.getTime() - 86_400_000).toISOString().slice(0, 10);
  return { from, to, rows: found.rows };
}

async function fillBake(prisma: PrismaClient, ownerId: string): Promise<void> {
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS calendar_entries_bake');
  await prisma.$executeRawUnsafe(`
    CREATE UNLOGGED TABLE calendar_entries_bake (
      owner_id uuid NOT NULL,
      kind text NOT NULL,
      source_id uuid NOT NULL,
      title text NOT NULL,
      local_start_day date NOT NULL,
      local_end_day date NOT NULL,
      starts_at timestamptz NOT NULL,
      color text
    )
  `);
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO calendar_entries_bake (
        owner_id, kind, source_id, title, local_start_day, local_end_day, starts_at, color
      )
      SELECT t.owner_id, 'task', t.id, t.title, t.local_start_day, t.local_end_day,
             COALESCE(t.start_date, t.due_date), p.color
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.owner_id = $1::uuid
        AND t.deleted_at IS NULL
        AND t.local_start_day IS NOT NULL
        AND t.local_end_day IS NOT NULL
        AND COALESCE(t.start_date, t.due_date) IS NOT NULL
    `,
    ownerId,
  );
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO calendar_entries_bake (
        owner_id, kind, source_id, title, local_start_day, local_end_day, starts_at, color
      )
      SELECT owner_id, 'event', id, title, local_start_day, local_end_day, starts_at, NULL
      FROM external_events
      WHERE owner_id = $1::uuid
        AND deleted_at IS NULL
        AND local_start_day IS NOT NULL
        AND local_end_day IS NOT NULL
    `,
    ownerId,
  );
  await prisma.$executeRawUnsafe(`
    CREATE INDEX calendar_entries_bake_owner_start_idx
      ON calendar_entries_bake (owner_id, local_start_day)
  `);
  await prisma.$executeRawUnsafe('ANALYZE calendar_entries_bake');
}

async function timeStore(
  prisma: PrismaClient,
  store: 'source' | 'bake',
  ownerId: string,
  month: { from: string; to: string; rows: number },
): Promise<StoreReport> {
  const summary = summarySql(store, ownerId);
  const range = rangeSql(store, ownerId, month.from, month.to);
  const summaryReport = await timeQuery(prisma, summary, 365);
  const rangeReport = await timeQuery(prisma, range, 500);
  return {
    month: month.from,
    monthRows: month.rows,
    summary: summaryReport,
    range: rangeReport,
  };
}

async function timeQuery(
  prisma: PrismaClient,
  query: BakeSql,
  expectedRows: number,
): Promise<QueryReport> {
  const explained = explainSql(query);
  for (let run = 0; run < WARMUP; run += 1) {
    await prisma.$queryRawUnsafe(explained.text, ...explained.values);
  }
  const samples: number[] = [];
  let last: ExplainTiming | null = null;
  let rows = 0;
  for (let run = 0; run < BAKE_RUNS; run += 1) {
    const result = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      explained.text,
      ...explained.values,
    );
    const payload = result[0]?.['QUERY PLAN'];
    const timing = explainTiming(payload);
    samples.push(timing.totalMs);
    last = timing;
    if (run === 0) {
      rows = actualRows(payload);
    }
  }
  if (last === null) {
    throw new Error('b0 bake: no samples');
  }
  if (rows !== expectedRows) {
    throw new Error(`b0 bake: expected ${String(expectedRows)} rows and got ${String(rows)}`);
  }
  const sample = bakeSample(samples);
  const sorted = [...samples].sort((left, right) => left - right);
  const mid = sorted[Math.floor((sorted.length - 1) / 2)];
  return {
    rows,
    p50: mid ?? sample.p95,
    p95: sample.p95,
    p99: sample.p99,
    indexes: last.indexes,
    sharedHitBlocks: last.sharedHitBlocks,
  };
}

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl !== undefined && process.argv[1]?.endsWith('b0-measure.ts')) {
  measureBake(databaseUrl).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'b0 bake failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
