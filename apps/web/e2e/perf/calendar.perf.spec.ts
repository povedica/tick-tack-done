import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface Sample {
  readonly coldMs: number;
  readonly interactionMs: number;
  readonly tbtMs: number;
  readonly maxLongTaskMs: number;
}

const manifestPath = process.env.PERF_MANIFEST ?? '';
const sessionPath = process.env.PERF_SESSION_FILE ?? '';
const resultPath = process.env.PERF_WEB_RESULT ?? 'perf-web.json';
const profile = process.env.PERF_PROFILE ?? 's';
const session = JSON.parse(readFileSync(sessionPath, 'utf8')) as { token: string };
const YEAR_MARK = /^5 de enero de 2026, 1 elemento$/;
const NEXT_YEAR_MARK = /^5 de enero de 2027, 0 elementos$/;
const MONTH_MARK = /^lunes, 5 de enero de 2026, 1 elemento$/;
const REPS = 3;
const VISIBLE_MS = profile === 'x100' ? 20 * 60_000 : 60_000;

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([
    {
      name: '__Host-rfx_session',
      value: session.token,
      url: baseURL ?? 'http://127.0.0.1:4174',
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
    },
  ]);
});

test('year, month and week: cold load, interaction and TBT', async ({ context }) => {
  test.setTimeout(profile === 'x100' ? 90 * 60_000 : 8 * 60_000);
  const year = await repeat(context, measureYear);
  const openMonth = await repeat(context, measureOpenMonth);
  const month = await repeat(context, measureMonth);
  const week = await repeat(context, measureWeek);
  const body = {
    profile,
    repetitions: REPS,
    cpu: 4,
    viewport: 'Pixel 7',
    timezoneId: 'Europe/Madrid',
    locale: 'es-ES',
    manifest: manifestPath,
    views: {
      year: median(year),
      openMonth: median(openMonth),
      month: median(month),
      week: median(week),
    },
  };
  writeFileSync(resultPath, `${JSON.stringify(body, null, 2)}\n`);
});

async function repeat(
  context: import('@playwright/test').BrowserContext,
  measure: (page: Page) => Promise<Sample>,
): Promise<Sample[]> {
  const samples: Sample[] = [];
  for (let index = 0; index < REPS; index += 1) {
    const page = await context.newPage();
    try {
      samples.push(await measure(page));
    } finally {
      await page.close();
    }
  }
  return samples;
}

async function measureYear(page: Page): Promise<Sample> {
  const cold = await load(page, '/calendar/year?date=2026-01-05', async () => {
    await expect(page.locator('.year-board')).toBeVisible({ timeout: VISIBLE_MS });
    await expect(page.getByRole('link', { name: YEAR_MARK })).toBeVisible({ timeout: VISIBLE_MS });
  });
  const interactionMs = await gestureUntil(
    page,
    () => swipe(page, '.year-board', 'up'),
    async () => {
      await expect(page.getByRole('link', { name: NEXT_YEAR_MARK })).toBeVisible({
        timeout: VISIBLE_MS,
      });
      await expect(page.getByRole('link', { name: YEAR_MARK })).toHaveCount(0);
    },
  );
  return { ...cold, interactionMs };
}

async function measureOpenMonth(page: Page): Promise<Sample> {
  const cold = await load(page, '/calendar/year?date=2026-01-05', async () => {
    await expect(page.getByRole('link', { name: YEAR_MARK })).toBeVisible({ timeout: VISIBLE_MS });
  });
  const interactionMs = await clickUntil(page, 'enero', async () => {
    await expect(page.getByRole('button', { name: MONTH_MARK })).toBeVisible({
      timeout: VISIBLE_MS,
    });
    await expect(page.getByRole('link', { name: YEAR_MARK })).toHaveCount(0);
  });
  return { ...cold, interactionMs };
}

async function measureMonth(page: Page): Promise<Sample> {
  const cold = await load(page, '/calendar/month?date=2026-01-05', async () => {
    await expect(page.getByRole('button', { name: /enero de 2026/ })).toBeVisible({
      timeout: VISIBLE_MS,
    });
    await expect(page.getByRole('button', { name: MONTH_MARK })).toBeVisible({
      timeout: VISIBLE_MS,
    });
  });
  const interactionMs = await gestureUntil(
    page,
    () => swipe(page, '.cal-month', 'up'),
    async () => {
      await expect(page.getByRole('button', { name: /febrero de 2026/ })).toBeVisible({
        timeout: VISIBLE_MS,
      });
      await expect(page.getByRole('button', { name: MONTH_MARK })).toHaveCount(0);
    },
  );
  return { ...cold, interactionMs };
}

async function measureWeek(page: Page): Promise<Sample> {
  const cold = await load(page, '/calendar/week?date=2026-01-05', async () => {
    await expect(page.getByText('PERF-SENTINEL').first()).toBeVisible({ timeout: VISIBLE_MS });
  });
  const interactionMs = await gestureUntil(
    page,
    () => swipe(page, '.mobile-week-board', 'left'),
    async () => {
      await expect(page.getByText('PERF-SENTINEL')).toHaveCount(0, { timeout: VISIBLE_MS });
      await expect(page).toHaveURL(/date=2026-01-1/);
    },
  );
  return { ...cold, interactionMs };
}

async function load(
  page: Page,
  url: string,
  ready: () => Promise<void>,
): Promise<Omit<Sample, 'interactionMs'>> {
  await page.addInitScript(() => {
    const durations: number[] = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        durations.push(entry.duration);
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
    (window as unknown as { __perfLongTasks: number[] }).__perfLongTasks = durations;
  });
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  const started = Date.now();
  await page.goto(url, { waitUntil: 'commit' });
  await ready();
  const coldMs = Date.now() - started;
  const durations = await page.evaluate(() => {
    const value = (window as unknown as { __perfLongTasks?: number[] }).__perfLongTasks;
    return Array.isArray(value) ? value : [];
  });
  const tbtMs = durations.reduce((sum, duration) => sum + Math.max(0, duration - 50), 0);
  const maxLongTaskMs = durations.reduce((max, duration) => Math.max(max, duration), 0);
  return { coldMs, tbtMs, maxLongTaskMs };
}

async function gestureUntil(
  page: Page,
  act: () => Promise<void>,
  ready: () => Promise<void>,
): Promise<number> {
  const started = Date.now();
  await act();
  await ready();
  return Date.now() - started;
}

/** Pixel 7 hides the desktop arrows. Year and month move on a vertical touch; week moves sideways. */
async function swipe(page: Page, selector: string, axis: 'up' | 'left'): Promise<void> {
  const box = await page.locator(selector).boundingBox();
  if (box === null) {
    throw new Error(`No box for ${selector}`);
  }
  const x = box.x + Math.min(80, box.width / 2);
  const y = Math.min(Math.max(box.y + 80, 160), 520);
  const endX = axis === 'left' ? x - 160 : x;
  const endY = axis === 'up' ? y - 160 : y;
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: endX, y: endY, id: 1 }],
  });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
}

async function clickUntil(page: Page, name: string, ready: () => Promise<void>): Promise<number> {
  const started = Date.now();
  await page.getByRole('button', { name, exact: true }).click();
  await ready();
  return Date.now() - started;
}

function median(samples: readonly Sample[]): Sample {
  return {
    coldMs: middle(samples.map((sample) => sample.coldMs)),
    interactionMs: middle(samples.map((sample) => sample.interactionMs)),
    tbtMs: middle(samples.map((sample) => sample.tbtMs)),
    maxLongTaskMs: middle(samples.map((sample) => sample.maxLongTaskMs)),
  };
}

function middle(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
