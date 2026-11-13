// Latency of summary and range against the ephemeral x100 seed.
// A 429, a stop at the safety cap, or a duplicated id is a failed run.
// Refuses port 4173. Requires TTD_EPHEMERAL=1.
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

if (__ENV.TTD_EPHEMERAL !== '1') {
  throw new Error('k6 calendar zoom requires TTD_EPHEMERAL=1');
}
const base = __ENV.TTD_BASE || '';
if (base.length === 0 || base.includes('4173')) {
  throw new Error('k6 calendar zoom refuses this base URL');
}

const rateLimited = new Counter('rate_limited');
const cursorCapped = new Counter('cursor_capped');
const duplicated = new Counter('duplicated_ids');
const zoomDuration = new Trend('zoom_duration', true);
const SAFETY = 80;
const YEAR_FROM = `${__ENV.TTD_YEAR || '2026'}-01-01`;
const YEAR_TO = `${__ENV.TTD_YEAR || '2026'}-12-31`;

export const options = {
  summaryTrendStats: ['count', 'p(50)', 'p(95)', 'p(99)'],
  scenarios: {
    zoom: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '10m',
      exec: 'zoom',
    },
  },
  thresholds: {
    checks: ['rate==1'],
    rate_limited: ['count==0'],
    cursor_capped: ['count==0'],
    duplicated_ids: ['count==0'],
    'zoom_duration{kind:summary}': ['p(95)<50', 'p(99)<200'],
    'zoom_duration{kind:range}': ['p(95)<50', 'p(99)<200'],
  },
};

function headers() {
  return { Authorization: `Bearer ${__ENV.TTD_TOKEN}`, Accept: 'application/json' };
}

function get(path, kind) {
  const response = http.get(`${base}${path}`, { headers: headers(), timeout: '60s' });
  if (response.status === 429) {
    rateLimited.add(1);
  }
  if (kind === 'summary' || kind === 'range') {
    zoomDuration.add(response.timings.duration, { kind });
  }
  check(response, {
    [`${kind} ok`]: (row) => row.status === 200,
  });
  return response;
}

function monthEnd(month) {
  const [year, rawMonth] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, rawMonth, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, '0')}`;
}

export function zoom() {
  for (let index = 0; index < 3; index += 1) {
    get(`/api/v1/calendar/summary?from=${YEAR_FROM}&to=${YEAR_TO}`, 'warmup');
  }
  for (let index = 0; index < 20; index += 1) {
    get(`/api/v1/calendar/summary?from=${YEAR_FROM}&to=${YEAR_TO}`, 'summary');
  }
  const seen = {};
  let cursor = '';
  let pages = 0;
  let from = '';
  let to = '';
  for (let month = 1; month <= 12; month += 1) {
    const key = `${__ENV.TTD_YEAR || '2026'}-${String(month).padStart(2, '0')}`;
    const end = monthEnd(key);
    const probe = get(`/api/v1/calendar/range?from=${key}-01&to=${end}&limit=500`, 'range');
    if (probe.status !== 200) {
      return;
    }
    const body = probe.json();
    if (body.next_cursor) {
      from = `${key}-01`;
      to = end;
      for (const entry of body.entries || []) {
        if (seen[entry.id]) {
          duplicated.add(1);
        }
        seen[entry.id] = true;
      }
      cursor = body.next_cursor;
      pages = 1;
      break;
    }
  }
  while (cursor.length > 0 && pages < SAFETY) {
    const response = get(
      `/api/v1/calendar/range?from=${from}&to=${to}&limit=500&cursor=${encodeURIComponent(cursor)}`,
      'range',
    );
    if (response.status !== 200) {
      return;
    }
    const body = response.json();
    for (const entry of body.entries || []) {
      if (seen[entry.id]) {
        duplicated.add(1);
      }
      seen[entry.id] = true;
    }
    pages += 1;
    cursor = body.next_cursor || '';
  }
  if (pages >= SAFETY && cursor.length > 0) {
    cursorCapped.add(1);
  }
  check(
    { pages },
    {
      'walked a month past 500': (row) => row.pages >= 2,
    },
  );
}
