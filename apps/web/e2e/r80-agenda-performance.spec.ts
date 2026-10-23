import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';

test('TTD-AUD-98: record Agenda cold and cached waterfall before optimizing', async ({
  page,
}, info) => {
  await r80Fixture(page, { delayed: true });
  const started = new Map<string, number>();
  const requests: { path: string; range: string; rows: number; ms: number; started: number }[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/')) started.set(request.url(), Date.now());
  });
  const pending: Promise<void>[] = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (!['/api/v1/tasks', '/api/v1/calendar/events'].includes(url.pathname)) return;
    pending.push(
      (async () => {
        const body = await response.json();
        const rows = Array.isArray(body.items)
          ? body.items.length
          : (body.external?.length ?? 0) + (body.tasks?.length ?? 0);
        requests.push({
          path: url.pathname,
          range: url.search,
          rows,
          ms: Date.now() - (started.get(response.url()) ?? Date.now()),
          started: started.get(response.url()) ?? 0,
        });
      })(),
    );
  });
  await page.goto('/calendar/agenda?date=2026-10-22');
  await expect(page.locator('[data-agenda-day]').first()).toBeVisible();
  const cold = await page.evaluate(() => performance.now());
  const mobile = info.project.name.startsWith('mobile');
  const nav = page.locator(mobile ? '.bottom-bar' : '.icon-rail');
  await nav.getByRole('link', { name: mobile ? 'Hoy' : 'Tareas', exact: true }).click();
  const before = await page.evaluate(() => performance.now());
  await page.goBack();
  await expect(page.locator('[data-agenda-day]').first()).toBeVisible();
  const cached = await page.evaluate((start) => performance.now() - start, before);
  await Promise.all(pending);
  const phase = process.env.R80_PHASE ?? 'antes';
  await mkdir(path.resolve('../../test-artifacts/audit/r80'), { recursive: true });
  await writeFile(
    path.resolve(
      '../../test-artifacts/audit/r80',
      `98-waterfall-${phase}-${info.project.name}.json`,
    ),
    JSON.stringify(
      {
        environment:
          process.env.R80_PREVIEW === '1'
            ? 'Production bundle; synthetic API 700 ms, cold document and cached history return'
            : 'Development Vite; synthetic API 700 ms, cold modules and cached history return',
        cold_ms: cold,
        cached_ms: cached,
        requests,
      },
      null,
      2,
    ),
  );
  if (phase === 'despues') {
    expect(cold).toBeLessThanOrEqual(3000);
    expect(cached).toBeLessThanOrEqual(1500);
    const first = requests.find((request) => request.path === '/api/v1/calendar/events');
    expect(new URLSearchParams(first!.range).get('from')).toBe('2026-09-21T22:00:00.000Z');
    expect(new URLSearchParams(first!.range).get('to')).toBe('2026-11-21T23:00:00.000Z');
  }
});
