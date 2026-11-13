// Year-view load of #109 §6.4. Read-only. Refuses anything that is not an
// ephemeral localhost base (TTD_EPHEMERAL=1). Never point this at production.
// TTD_BASE, TTD_TOKEN, TTD_MANIFEST, TTD_SUMMARY_PATH, TTD_GATE=1, TTD_DURATION.
import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

const base = __ENV.TTD_BASE || '';
if (__ENV.TTD_EPHEMERAL !== '1') {
  throw new Error('k6 year view requires TTD_EPHEMERAL=1');
}
const local =
  base.startsWith('http://127.0.0.1:') ||
  base.startsWith('http://127.0.0.1/') ||
  base.startsWith('http://localhost:') ||
  base.startsWith('http://localhost/');
if (!local) {
  throw new Error('k6 year view refuses a non-local base URL');
}

const manifest = JSON.parse(open(__ENV.TTD_MANIFEST));
const token =
  typeof __ENV.TTD_TOKEN === 'string' && __ENV.TTD_TOKEN.length > 0
    ? __ENV.TTD_TOKEN
    : open(__ENV.TTD_TOKEN_FILE).trim();
const duration = __ENV.TTD_DURATION || '1m';
const gate = __ENV.TTD_GATE === '1';
const serverTiming = new Trend('server_timing_total', true);
const YEAR = String(manifest.year);
const FROM = `${YEAR}-01-01`;
const TO = `${YEAR}-12-31`;
const DAY = manifest.sentinel.day;

const thresholds = {
  http_req_failed: ['rate<0.001'],
  'http_req_duration{api:summary,scenario:rafaga}': ['p(95)<200'],
  'http_req_duration{api:tasks,scenario:rafaga}': ['p(95)<200'],
  'http_req_duration{api:events,scenario:rafaga}': ['p(95)<200'],
  'http_req_duration{api:projects,scenario:rafaga}': ['p(95)<150'],
  'http_req_duration{api:subscriptions,scenario:rafaga}': ['p(95)<200'],
  'http_req_duration{api:range,scenario:rafaga}': ['p(95)<200'],
  'server_timing_total{scenario:usuario}': ['p(95)<50'],
};

export const options = {
  summaryTrendStats: ['count', 'p(50)', 'p(95)', 'p(99)'],
  scenarios: {
    usuario: {
      executor: 'constant-vus',
      vus: 1,
      duration,
      exec: 'usuario',
    },
    rafaga: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration,
      preAllocatedVUs: 10,
      maxVUs: 20,
      exec: 'rafaga',
      startTime: duration,
    },
  },
  thresholds: gate ? thresholds : {},
};

function headers() {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

function timingTotal(response) {
  const header = String(
    response.headers['Server-Timing'] || response.headers['server-timing'] || '',
  );
  const match = /total;dur=([0-9.]+)/.exec(header);
  return match === null ? null : Number(match[1]);
}

function get(path, api) {
  const response = http.get(`${base}${path}`, {
    headers: headers(),
    tags: { api },
    timeout: '30s',
  });
  const total = timingTotal(response);
  if (total !== null) {
    serverTiming.add(total);
  }
  check(response, {
    [`${api} 200`]: (row) => row.status === 200,
  });
  return response;
}

function yearCalls() {
  get(`/api/v1/calendar/summary?from=${FROM}&to=${TO}&granularity=day&context=auto`, 'summary');
  get('/api/v1/projects', 'projects');
  get('/api/v1/calendar/subscriptions', 'subscriptions');
  get(
    `/api/v1/tasks?status=active&limit=100&sort=due&from=${FROM}&to=${Number(YEAR) + 1}-01-01&range_field=any&context=auto&fields=calendar`,
    'tasks',
  );
  const from = encodeURIComponent(manifest.yearWindow.dueAfter);
  const to = encodeURIComponent(manifest.yearWindow.dueBefore);
  get(`/api/v1/calendar/events?from=${from}&to=${to}&context=auto&include=external`, 'events');
  get(
    `/api/v1/calendar/range?from=${DAY}&to=${DAY}&fields=compact&context=auto&limit=100`,
    'range',
  );
}

export function usuario() {
  yearCalls();
}

export function rafaga() {
  yearCalls();
}

function metricValues(data, prefix, tags) {
  const key = Object.keys(data.metrics).find(
    (name) => name.startsWith(prefix) && tags.every((tag) => name.includes(tag)),
  );
  return key === undefined ? {} : data.metrics[key].values;
}

export function handleSummary(data) {
  const names = ['summary', 'projects', 'subscriptions', 'tasks', 'events', 'range'];
  const summary = { routes: {}, server_timing_total: {}, scenarios: ['usuario', 'rafaga'] };
  for (const name of names) {
    for (const scenario of summary.scenarios) {
      const values = metricValues(data, 'http_req_duration{', [
        `api:${name}`,
        `scenario:${scenario}`,
      ]);
      summary.routes[`${name}:${scenario}`] = {
        p50: values['p(50)'] ?? null,
        p95: values['p(95)'] ?? null,
        p99: values['p(99)'] ?? null,
        count: values.count ?? 0,
      };
    }
  }
  for (const scenario of summary.scenarios) {
    const values = metricValues(data, 'server_timing_total{', [`scenario:${scenario}`]);
    summary.server_timing_total[scenario] = {
      p50: values['p(50)'] ?? null,
      p95: values['p(95)'] ?? null,
      count: values.count ?? 0,
    };
  }
  const target = __ENV.TTD_SUMMARY_PATH || 'k6-vista.json';
  return { [target]: JSON.stringify(summary, null, 2) };
}
