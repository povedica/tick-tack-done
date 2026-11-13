// Read-only year-view baseline. Walks the task cursor to the end.
// A run that returns 429 or stops at the safety cap is not a baseline.
// TTD_BASE, TTD_TOKEN, TTD_MANIFEST, TTD_SUMMARY_PATH, TTD_OPENS.
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const manifest = JSON.parse(open(__ENV.TTD_MANIFEST));
const rateLimited = new Counter('rate_limited');
const cursorCapped = new Counter('cursor_capped');
const routeDuration = {
  tasks: new Trend('route_tasks', true),
  events: new Trend('route_events', true),
  projects: new Trend('route_projects', true),
  subscriptions: new Trend('route_subscriptions', true),
};
const SAFETY = 200;
const BASE = __ENV.TTD_BASE || 'http://127.0.0.1:3099';
const OPENS = Number(__ENV.TTD_OPENS || 8);

export const options = {
  summaryTrendStats: ['count', 'p(50)', 'p(95)', 'p(99)'],
  scenarios: {
    baseline: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '45m',
      exec: 'baseline',
    },
  },
  thresholds: {
    checks: ['rate==1'],
    rate_limited: ['count==0'],
    cursor_capped: ['count==0'],
  },
};

function authHeaders() {
  return { Authorization: `Bearer ${__ENV.TTD_TOKEN}`, Accept: 'application/json' };
}

function get(path, api) {
  const response = http.get(`${BASE}${path}`, {
    headers: authHeaders(),
    tags: { api },
    timeout: '180s',
  });
  if (response.status === 429) {
    rateLimited.add(1);
  }
  routeDuration[api].add(response.timings.duration);
  const timing = String(
    response.headers['Server-Timing'] || response.headers['server-timing'] || '',
  );
  check(response, {
    [`${api} 200`]: (row) => row.status === 200,
    [`${api} server-timing`]: () => timing.includes('auth;dur=') && timing.includes('total;dur='),
  });
  return response;
}

function taskQuery(cursor) {
  const cursorQuery = cursor.length > 0 ? `&cursor=${encodeURIComponent(cursor)}` : '';
  return `/api/v1/tasks?status=active&limit=100&sort=due&from=${manifest.year}-01-01&to=${Number(manifest.year) + 1}-01-01&range_field=any&context=auto${cursorQuery}`;
}

function walkTasks() {
  let cursor = '';
  let pages = 0;
  let tasks = 0;
  while (pages < SAFETY) {
    const response = get(taskQuery(cursor), 'tasks');
    if (response.status !== 200) {
      return { pages, tasks, done: false };
    }
    const body = response.json();
    const items = Array.isArray(body.items) ? body.items : [];
    tasks += items.length;
    pages += 1;
    const next = body.next_cursor;
    if (next === null || next === undefined || next === '') {
      return { pages, tasks, done: true };
    }
    cursor = String(next);
  }
  cursorCapped.add(1);
  check(false, { 'cursor finished before the safety cap': () => false });
  return { pages, tasks, done: false };
}

function eventsPath() {
  const from = encodeURIComponent(manifest.yearWindow.dueAfter);
  const to = encodeURIComponent(manifest.yearWindow.dueBefore);
  return `/api/v1/calendar/events?from=${from}&to=${to}&context=auto&include=external`;
}

function oneOpen(countEvents) {
  const walked = walkTasks();
  const events = get(eventsPath(), 'events');
  const projects = get('/api/v1/projects', 'projects');
  get('/api/v1/calendar/subscriptions', 'subscriptions');
  if (projects.status === 200) {
    check(projects.json(), {
      'projects fit in one page': (body) => body.next_cursor === null,
    });
  }
  if (countEvents && events.status === 200) {
    const external = events.json('external');
    const count = Array.isArray(external) ? external.length : 0;
    check(count, {
      'all seeded events': (value) => value === manifest.counts.events,
    });
  }
  return walked;
}

export function baseline() {
  check(__ENV.TTD_TOKEN, {
    'token is present': (token) => typeof token === 'string' && token.length > 0,
  });
  const first = oneOpen(true);
  const expectedPages = Math.ceil(manifest.counts.tasks / 100);
  check(first, {
    'task cursor reached the end': (row) => row.done === true,
    'task page count is the full year': (row) => row.pages === expectedPages,
    'task count matches the seed': (row) => row.tasks === manifest.counts.tasks,
  });
  for (let index = 0; index < OPENS; index += 1) {
    oneOpen(false);
  }
  const planned = manifest.requestsPerOpen * (OPENS + 1);
  check(planned, {
    'scenario fits 1000 requests per 15 min': (value) => value <= 1000,
  });
}

export function handleSummary(data) {
  const routes = ['tasks', 'events', 'projects', 'subscriptions'];
  const summary = { routes: {}, rate_limited: 0, cursor_capped: 0, opens: OPENS };
  for (const route of routes) {
    const metric = data.metrics[`route_${route}`];
    const values = metric === undefined ? {} : metric.values;
    summary.routes[route] = {
      p50: values['p(50)'] ?? null,
      p95: values['p(95)'] ?? null,
      p99: values['p(99)'] ?? null,
      count: values.count ?? 0,
    };
  }
  const limited = data.metrics.rate_limited;
  const capped = data.metrics.cursor_capped;
  summary.rate_limited = limited === undefined ? 0 : limited.values.count;
  summary.cursor_capped = capped === undefined ? 0 : capped.values.count;
  const target = __ENV.TTD_SUMMARY_PATH || 'k6-summary.json';
  return { [target]: JSON.stringify(summary, null, 2) };
}
