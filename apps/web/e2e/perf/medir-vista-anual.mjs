// F0 measurement. Production build, Pixel 7, Europe/Madrid, es-ES, CPU 4×.
// Synthetic fixtures only (~70 tasks, 100 events). Median of 3 cold loads.
// "Visible" means the requested year grid and a known fixture mark, not merely .year-day cells.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = process.env.DIST ?? path.resolve(here, '../../dist');
const runs = Number(process.env.RUNS ?? 3);
const cpuRate = Number(process.env.CPU ?? 4);
const port = Number(process.env.PORT ?? 4187);
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const SENTINEL_2026 = '15 de junio de 2026, 1 elemento';
const SENTINEL_2027 = '15 de junio de 2027, 1 elemento';

function task(id, due, extra = {}) {
  return {
    id,
    project_id: 'list',
    parent_id: null,
    column_id: null,
    title: id,
    content: '',
    status: 'active',
    kind: 'task',
    priority: 'none',
    due_date: due,
    start_date: null,
    time_zone: 'Europe/Madrid',
    is_all_day: true,
    repeat_rule: null,
    tag_ids: [],
    checklist_progress: { completed: 0, total: 0 },
    duration_minutes: null,
    completed_at: null,
    created_at: '2026-01-01T00:00:00Z',
    source: 'manual',
    ...extra,
  };
}

function buildFixtures() {
  const tasks = [
    task('sentinel-2026', '2026-06-15T10:00:00Z', {
      title: 'Marca centinela 2026',
      project_id: 'sentinel',
      is_all_day: false,
    }),
    task('sentinel-2027', '2027-06-15T10:00:00Z', {
      title: 'Marca centinela 2027',
      project_id: 'sentinel',
      is_all_day: false,
    }),
  ];
  // 68 more dated tasks in 2026, skipping 15 June so the sentinel day stays at count 1.
  for (let index = 0; index < 68; index += 1) {
    const day = (index % 27) + 1;
    const month = (index % 12) + 1;
    if (month === 6 && day === 15) continue;
    const iso = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T09:00:00Z`;
    tasks.push(
      task(`task-${String(index)}`, iso, { project_id: index % 2 === 0 ? 'list' : 'other' }),
    );
  }
  while (tasks.length < 70) {
    const n = tasks.length;
    tasks.push(
      task(`pad-${String(n)}`, `2026-08-${String((n % 27) + 1).padStart(2, '0')}T11:00:00Z`),
    );
  }

  const external = [];
  for (let index = 0; index < 100; index += 1) {
    const day = (index % 27) + 1;
    const month = ((index + 3) % 12) + 1;
    if (month === 6 && day === 15) continue;
    const start = Date.UTC(2026, month - 1, day, 8, 0, 0);
    const multi = index % 17 === 0;
    external.push({
      id: `event-${String(index)}`,
      subscription_id: 'cal',
      title: `Evento ${String(index)}`,
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(start + (multi ? 2 : 1) * 60 * 60 * 1000).toISOString(),
      is_all_day: index % 11 === 0,
      time_zone: 'Europe/Madrid',
      color: index % 2 === 0 ? '#0f766e' : '#c2410c',
    });
  }
  while (external.length < 100) {
    const n = external.length;
    const start = Date.UTC(2026, 0, (n % 27) + 1, 12, 0, 0);
    external.push({
      id: `event-pad-${String(n)}`,
      subscription_id: 'cal',
      title: `Evento extra ${String(n)}`,
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(start + 60 * 60 * 1000).toISOString(),
      is_all_day: false,
      time_zone: 'Europe/Madrid',
      color: '#4772fa',
    });
  }
  return { tasks: tasks.slice(0, 70), external: external.slice(0, 100) };
}

const fixtures = buildFixtures();

function apiBody(pathname) {
  if (pathname === '/api/v1/auth/session' || pathname === '/api/v1/me') {
    return {
      id: 'user',
      display_name: 'Medición',
      email: 'perf@example.test',
      csrf_token: 'test',
      locale: 'es',
      time_zone: 'Europe/Madrid',
      features: {},
    };
  }
  if (pathname === '/api/v1/tasks') {
    return { items: fixtures.tasks, next_cursor: null };
  }
  if (pathname === '/api/v1/calendar/events') {
    return { external: fixtures.external, tasks: [] };
  }
  if (pathname === '/api/v1/projects') {
    return {
      items: [
        {
          id: 'list',
          name: 'Lista',
          color: '#4772fa',
          is_inbox: true,
          kind: 'list',
          sort_order: '1',
        },
        {
          id: 'other',
          name: 'Otra',
          color: '#b45309',
          is_inbox: false,
          kind: 'list',
          sort_order: '2',
        },
        {
          id: 'sentinel',
          name: 'Centinela',
          color: '#ff00aa',
          is_inbox: false,
          kind: 'list',
          sort_order: '3',
        },
      ],
      next_cursor: null,
    };
  }
  if (pathname === '/api/v1/calendar/subscriptions') {
    return {
      items: [
        { id: 'cal', summary: 'Sintético', visible: true, color: '#4772fa', provider: 'google' },
      ],
      next_cursor: null,
    };
  }
  if (pathname === '/api/v1/events/stream') return null;
  return { items: [], next_cursor: null };
}

const mime = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function startServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/v1/events/stream') {
        response.writeHead(204);
        response.end();
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify(apiBody(url.pathname)));
      return;
    }
    let file = path.join(dist, decodeURIComponent(url.pathname));
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) {
      file = path.join(dist, 'index.html');
    }
    response.writeHead(200, {
      'content-type': mime[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function maxLongTask(entries) {
  return entries.reduce((max, entry) => Math.max(max, entry[1]), 0);
}

async function measureOnce(browser) {
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    serviceWorkers: 'block',
  });
  await context.addInitScript(() => {
    window.__lt = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__lt.push([Math.round(entry.startTime), Math.round(entry.duration)]);
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
    localStorage.setItem('tick-tack-done.locale', 'es');
  });
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  const started = Date.now();
  await page.goto(`http://127.0.0.1:${String(port)}/calendar/year?date=2026-06-15`, {
    waitUntil: 'commit',
  });
  await page.waitForFunction(
    (label) => {
      const link = document.querySelector('a.year-day[href="/calendar/day?date=2026-06-15"]');
      const cards = document.querySelectorAll('.year-card').length;
      return cards === 12 && link?.getAttribute('aria-label') === label;
    },
    SENTINEL_2026,
    { timeout: 180_000, polling: 50 },
  );
  const boardVisible = Date.now() - started;
  const loadTasks = await page.evaluate(() => window.__lt);
  await page.evaluate(() => {
    window.__lt = [];
  });
  const nextStarted = Date.now();
  await page.evaluate(() => {
    const board = document.querySelector('.year-board');
    if (!(board instanceof HTMLElement)) return;
    board.focus();
    board.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
  });
  await page.waitForFunction(
    (label) => {
      const link = document.querySelector('a.year-day[href="/calendar/day?date=2027-06-15"]');
      const stale = document.querySelector('a.year-day[href="/calendar/day?date=2026-06-15"]');
      return link?.getAttribute('aria-label') === label && stale === null;
    },
    SENTINEL_2027,
    { timeout: 180_000, polling: 50 },
  );
  const nextYear = Date.now() - nextStarted;
  const nextTasks = await page.evaluate(() => window.__lt);
  await context.close();
  return {
    board_visible_ms: boardVisible,
    load_max_longtask_ms: maxLongTask(loadTasks),
    next_year_ms: nextYear,
    next_max_longtask_ms: maxLongTask(nextTasks),
  };
}

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error(`Missing production build at ${dist}`);
  process.exit(1);
}

const server = await startServer();
const browser = await chromium.launch({
  executablePath: existsSync(chrome) ? chrome : undefined,
  args: ['--headless=new'],
});
const samples = [];
for (let index = 0; index < runs; index += 1) {
  samples.push(await measureOnce(browser));
}
await browser.close();
server.close();

const summary = {
  cpu: cpuRate,
  runs,
  tasks: fixtures.tasks.length,
  events: fixtures.external.length,
  samples,
  median: {
    board_visible_ms: median(samples.map((sample) => sample.board_visible_ms)),
    load_max_longtask_ms: median(samples.map((sample) => sample.load_max_longtask_ms)),
    next_year_ms: median(samples.map((sample) => sample.next_year_ms)),
  },
};
console.log(JSON.stringify(summary, null, 2));
