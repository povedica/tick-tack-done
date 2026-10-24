import { test, expect } from '@playwright/test';
import path from 'node:path';
import { wtAFixture } from './wt-a.fixture';
test('RF-1101 TTD-AUD-133: date-only period navigator', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('wt-a-'));
  await wtAFixture(page);
  await page.goto('/calendar/week?date=2026-10-28');
  const button = page.locator('.calendar-period > button');
  await button.click();
  const phase = process.env.WT_A_PHASE ?? 'despues';
  await page.screenshot({
    path: path.resolve(
      '../../test-artifacts/audit/evidencias/wt-a',
      `133_period_${phase}_${info.project.name.replace('wt-a-', '').replace('-', '_')}.png`,
    ),
  });
  if (phase === 'antes') return;
  await expect(button).toContainText('28/10/2026');
  if (page.viewportSize()!.width <= 768) {
    const done = page.locator('.date-popover .sheet-footer button').last();
    await expect(done).toBeVisible();
    const b = (await done.boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
  const panel = page.locator('.date-popover');
  await expect(
    panel.locator('.date-shortcuts,.inline-time-row,.popover-tabs,.popover-row'),
  ).toHaveCount(0);
  await panel.locator('[data-date="2026-11-05"]').click();
  await expect(page).toHaveURL(/date=2026-11-05/);
  await page.goto('/reports/weekly');
  await expect(page.locator('.week-range > button').first()).toBeVisible();
});

test('RF-1101 TTD-AUD-133: en-US browser uses local numeric date', async ({ browser }, info) => {
  test.skip(info.project.name !== 'wt-a-1280-light' || process.env.WT_A_PHASE === 'antes');
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await wtAFixture(page);
  await page.addInitScript(() => localStorage.setItem('tick-tack-done.locale', 'auto'));
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: {
        id: 'user',
        locale: 'auto',
        display_name: 'Prueba',
        email: 'test@example.test',
        features: {},
        time_zone: 'Europe/Madrid',
      },
    }),
  );
  await page.goto('/calendar/week?date=2026-10-28');
  await expect(page.locator('.calendar-period > button')).toContainText('10/28/2026');
  await page.goto('/calendar/month?date=2026-10-28');
  await expect(page.locator('.cal-head').first()).toHaveText('Wk');
  await context.close();
});
