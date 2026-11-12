import { expect, test, type Request } from '@playwright/test';

const YEAR = '/calendar/year?date=2026-11-12';
const EMAIL = process.env.PERF_EMAIL ?? 'demo@reflexionia.test';
const PASSWORD = process.env.PERF_PASSWORD ?? 'dev-only';

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(EMAIL);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/today/, { timeout: 20_000 });
});

test('CA-R1-1: the year view asks for summary, subscriptions and projects', async ({ page }) => {
  const seen: string[] = [];
  page.on('request', (request) => {
    const path = requestPath(request);
    if (
      path.startsWith('/api/v1/calendar/') ||
      path.startsWith('/api/v1/projects') ||
      path.startsWith('/api/v1/tasks')
    ) {
      seen.push(path);
    }
  });
  await page.goto(YEAR);
  await expect(page.locator('.year-board')).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(() => seen.some((path) => pathname(path) === '/api/v1/calendar/summary'))
    .toBe(true);
  // Vite keeps a socket open, so networkidle never settles. One second lets
  // a duplicate summary or subscription show up before the counts below.
  await page.waitForTimeout(1_000);
  const tasks = seen.filter((path) => pathname(path) === '/api/v1/tasks');
  expect(seen.filter((path) => /^\/api\/v1\/tasks\/[0-9a-f-]{36}$/.test(pathname(path)))).toEqual(
    [],
  );
  // The rail's overdue count is the shell, not a request of this view.
  expect(tasks.filter((path) => !isShellOverdue(path))).toEqual([]);
  expect(seen.filter((path) => pathname(path) === '/api/v1/calendar/events')).toEqual([]);
  const viewProjects = seen.filter(
    (path) => pathname(path) === '/api/v1/projects' && !isArchivedProjects(path),
  );
  const subscriptions = seen.filter((path) => pathname(path) === '/api/v1/calendar/subscriptions');
  const summaries = seen.filter((path) => pathname(path) === '/api/v1/calendar/summary');
  expect(summaries).toHaveLength(1);
  expect(subscriptions).toHaveLength(1);
  expect(viewProjects).toHaveLength(1);
  expect(viewProjects.length + subscriptions.length + summaries.length).toBeLessThanOrEqual(3);
  const card = page.locator('.year-card').first();
  await expect(card).toBeVisible();
  await expect
    .poll(() => card.evaluate((node) => getComputedStyle(node).contentVisibility))
    .toBe('auto');
});

test('CA-R1-3: the second year load revalidates the summary with 304', async ({ page }) => {
  const statuses: number[] = [];
  page.on('response', (response) => {
    if (requestPath(response.request()).startsWith('/api/v1/calendar/summary')) {
      statuses.push(response.status());
    }
  });
  await page.goto(YEAR);
  await expect(page.locator('.year-board')).toBeVisible();
  await expect.poll(() => statuses.includes(200)).toBe(true);
  statuses.length = 0;
  await page.reload();
  await expect(page.locator('.year-board')).toBeVisible();
  await expect.poll(() => statuses[0]).toBe(304);
});

test('CA-R1-4: opening a day stays within 200 ms when the range is prefetched', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const durations: number[] = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const timing = entry as PerformanceEventTiming;
        if (timing.interactionId !== undefined && timing.interactionId > 0) {
          durations.push(timing.duration);
        }
      }
    });
    observer.observe({ type: 'event', buffered: true, durationThreshold: 0 });
    (window as unknown as { __inp: number[] }).__inp = durations;
  });
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const samples: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    await page.goto(YEAR, { timeout: 30_000, waitUntil: 'domcontentloaded' });
    await expect(page.locator('.year-board')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.year-card')).toHaveCount(12, { timeout: 15_000 });
    const day = page.locator('a.year-day').first();
    await expect(day).toBeVisible();
    const range = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/calendar/range') && response.request().method() === 'GET',
      { timeout: 15_000 },
    );
    await day.dispatchEvent('pointerdown');
    await range;
    await day.locator('.year-num').click();
    await expect(page.locator('.calendar-day-popover')).toBeVisible();
    const durations = await page.evaluate(() => {
      const value = (window as unknown as { __inp?: number[] }).__inp;
      return Array.isArray(value) ? value : [];
    });
    samples.push(Math.max(0, ...durations));
    await page.evaluate(() => {
      const value = (window as unknown as { __inp?: number[] }).__inp;
      if (Array.isArray(value)) value.length = 0;
    });
  }
  samples.sort((left, right) => left - right);
  expect(samples[1] ?? 0).toBeLessThanOrEqual(200);
});

function requestPath(request: Request): string {
  const url = new URL(request.url());
  return url.pathname + url.search;
}

function pathname(path: string): string {
  return path.split('?')[0] ?? path;
}

function isShellOverdue(path: string): boolean {
  return new URL(path, 'http://local').searchParams.get('overdue') === 'true';
}

function isArchivedProjects(path: string): boolean {
  return new URL(path, 'http://local').searchParams.get('state') === 'archived';
}
