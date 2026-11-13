import { gzipSync } from 'node:zlib';
import { Prisma, PrismaClient } from '@prisma/client';
import { authorizedLists } from '@reflexionia/domain';
import { readFileSync } from 'node:fs';
import { assertEphemeralDatabase, PERF_YEAR } from './fixture.js';
import { rangeIdQuery, type ZoomRead } from '../modules/calendar/calendar-zoom.sql.js';

const SEED_EMAIL = 'perf-seed@example.test';

/**
 * Pages one month of the ephemeral seed through the API and compares ids
 * with the same predicates the page uses. Also checks the year summary gzip.
 */
export async function walkZoom(databaseUrl: string, apiBase: string, token: string): Promise<void> {
  assertEphemeralDatabase(databaseUrl, process.env.PERF_SEED);
  if (apiBase.includes('4173')) {
    throw new Error('zoom walk refuses port 4173');
  }
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const owner = await prisma.user.findUnique({
      where: { email: SEED_EMAIL },
      select: { id: true },
    });
    if (owner === null) {
      throw new Error('zoom walk: seed the x100 profile first');
    }
    const month = await busiestMonth(prisma, owner.id);
    const bounds = monthBounds(month);
    const expected = await expectedIds(prisma, owner.id, bounds.from, bounds.to);
    if (expected.length <= 500) {
      throw new Error(
        `zoom walk: ${month} has ${String(expected.length)} entries, need more than 500`,
      );
    }
    const seen = await pageRange(apiBase, token, bounds.from, bounds.to);
    const missing = expected.filter((id) => !seen.has(id));
    const extra = [...seen].filter((id) => !expected.includes(id));
    if (missing.length > 0 || extra.length > 0 || seen.size !== expected.length) {
      throw new Error(
        `zoom walk: month ${month} expected ${String(expected.length)} got ${String(seen.size)} missing ${String(missing.length)} extra ${String(extra.length)}`,
      );
    }
    const summary = await getJson(
      apiBase,
      token,
      `/api/v1/calendar/summary?from=${String(PERF_YEAR)}-01-01&to=${String(PERF_YEAR)}-12-31`,
    );
    const gzip = gzipSync(JSON.stringify(summary.body)).length;
    const timing = summary.timing;
    if (gzip > 6 * 1024) {
      throw new Error(`zoom walk: year summary is ${String(gzip)} bytes gzip`);
    }
    process.stdout.write(
      `${JSON.stringify({ month, entries: expected.length, pages: seen.size > 0 ? 'ok' : 'empty', gzip, timing })}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function busiestMonth(prisma: PrismaClient, ownerId: string): Promise<string> {
  const rows = await prisma.$queryRaw<{ month: Date; n: number }[]>(Prisma.sql`
    SELECT date_trunc('month', local_start_day)::date AS month, count(*)::int AS n
    FROM (
      SELECT local_start_day
      FROM tasks
      WHERE owner_id = CAST(${ownerId} AS uuid)
        AND deleted_at IS NULL
        AND status = 'active'::"TaskStatus"
        AND local_start_day IS NOT NULL
      UNION ALL
      SELECT e.local_start_day
      FROM external_events e
      JOIN calendar_subscriptions s ON s.id = e.subscription_id
      WHERE e.owner_id = CAST(${ownerId} AS uuid)
        AND e.deleted_at IS NULL
        AND e.local_start_day IS NOT NULL
        AND s.deleted_at IS NULL
        AND s.visible = TRUE
    ) marks
    WHERE local_start_day >= CAST(${`${String(PERF_YEAR)}-01-01`} AS date)
      AND local_start_day <= CAST(${`${String(PERF_YEAR)}-12-31`} AS date)
    GROUP BY 1
    ORDER BY n DESC
    LIMIT 1
  `);
  const month = rows[0]?.month;
  if (month === undefined) {
    throw new Error('zoom walk: the seed has no local days');
  }
  return month.toISOString().slice(0, 10);
}

function monthBounds(first: string): { from: string; to: string } {
  const year = Number(first.slice(0, 4));
  const month = Number(first.slice(5, 7));
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const key = `${String(year)}-${String(month).padStart(2, '0')}`;
  return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, '0')}` };
}

async function expectedIds(
  prisma: PrismaClient,
  ownerId: string,
  from: string,
  to: string,
): Promise<string[]> {
  const lists = authorizedLists(null, []);
  const query: ZoomRead = {
    ownerId,
    from,
    to,
    lists,
    tags: [],
    cals: [],
    includeTasks: true,
    includeEvents: true,
    workMode: 'all',
    workProjects: [],
    workFolders: [],
    workTags: [],
    full: false,
    cursor: null,
    limit: 500,
  };
  const rows = await prisma.$queryRaw<{ id: string }[]>(rangeIdQuery(query));
  return rows.map((row) => row.id);
}

async function pageRange(
  apiBase: string,
  token: string,
  from: string,
  to: string,
): Promise<Set<string>> {
  const seen = new Set<string>();
  let cursor = '';
  for (let page = 0; page < 80; page += 1) {
    const path = `/api/v1/calendar/range?from=${from}&to=${to}&limit=500${
      cursor.length > 0 ? `&cursor=${encodeURIComponent(cursor)}` : ''
    }`;
    const response = await getJson(apiBase, token, path);
    if (response.status === 429) {
      throw new Error('zoom walk: 429 is not a result');
    }
    if (response.status !== 200) {
      throw new Error(`zoom walk: range returned ${String(response.status)}`);
    }
    const entries = response.body.entries as { id: string }[];
    for (const entry of entries) {
      if (seen.has(entry.id)) {
        throw new Error(`zoom walk: duplicated ${entry.id}`);
      }
      seen.add(entry.id);
    }
    const next = response.body.next_cursor;
    if (typeof next !== 'string' || next.length === 0) {
      return seen;
    }
    cursor = next;
  }
  throw new Error('zoom walk: cursor did not finish');
}

async function getJson(
  apiBase: string,
  token: string,
  path: string,
): Promise<{
  status: number;
  timing: string;
  body: { entries?: { id: string }[]; next_cursor?: string | null };
}> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const body = (await response.json()) as {
    entries?: { id: string }[];
    next_cursor?: string | null;
  };
  return { status: response.status, timing: response.headers.get('server-timing') ?? '', body };
}

const databaseUrl = process.env.DATABASE_URL;
const apiBase = process.env.PERF_API_BASE;
const tokenFile = process.env.PERF_TOKEN_FILE;
if (databaseUrl === undefined || apiBase === undefined || tokenFile === undefined) {
  throw new Error('zoom walk needs DATABASE_URL, PERF_API_BASE and PERF_TOKEN_FILE');
}
const token = readFileSync(tokenFile, 'utf8').trim();
walkZoom(databaseUrl, apiBase, token).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'zoom walk failed';
  process.stderr.write(`${message.replace(/postgresql:\/\/\S+/g, 'postgresql://***')}\n`);
  process.exit(1);
});
