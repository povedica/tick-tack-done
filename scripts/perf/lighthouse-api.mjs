// Simulated API for Lighthouse on vite preview (§5.6 fallback).
// Staging does not serve this branch, so CI measures the built year view here.
import { createServer } from 'node:http';

const port = Number(process.env.LH_API_PORT ?? '4010');
const user = {
  id: 'user',
  display_name: 'Semilla',
  email: 'perf-seed@example.test',
  csrf_token: 'lighthouse',
  locale: 'es',
  time_zone: 'Europe/Madrid',
  features: {},
  week_start: 'monday',
};

const summary = {
  time_zone: 'Europe/Madrid',
  version: '1',
  granularity: 'day',
  days: { '2026-03-15': { n: 1, c: ['#2563eb'] } },
  truncated: false,
};

function bodyFor(path) {
  if (path === '/auth/session' || path === '/me') return user;
  if (path === '/health') {
    return { status: 'ok', commit: 'local', version: '0.2.0' };
  }
  if (path === '/calendar/summary') return summary;
  if (path === '/calendar/subscriptions') return { items: [], next_cursor: null };
  if (path === '/calendar/sync-status')
    return { google: { status: 'disconnected' }, subscriptions: [] };
  if (path === '/focus/sessions') return { items: [], next_cursor: null };
  if (path === '/focus/settings') {
    return {
      pomodoroMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      cyclesBeforeLongBreak: 4,
    };
  }
  if (
    path === '/projects' ||
    path === '/tags' ||
    path === '/filters' ||
    path === '/folders' ||
    path === '/tasks'
  ) {
    return { items: [], next_cursor: null };
  }
  return { items: [], next_cursor: null };
}

const server = createServer((request, response) => {
  const path = (request.url ?? '/').split('?')[0]?.replace(/^\/api\/v1/, '') ?? '/';
  const body = JSON.stringify(bodyFor(path));
  response.writeHead(200, {
    'content-type': 'application/json',
    etag: '"lighthouse-summary"',
    'cache-control': 'private, no-cache',
  });
  response.end(body);
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`lighthouse-api ${String(port)}\n`);
});
