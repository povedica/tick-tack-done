import { test, expect } from '@playwright/test';
import path from 'node:path';
import { wtAFixture } from './wt-a.fixture';
test('RF-1101 TTD-AUD-107: compact month uses dots and opens complete day titles', async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith('wt-a-'));
  await wtAFixture(page);
  await page.goto('/calendar/month?date=2026-10-29');
  const phase = process.env.WT_A_PHASE ?? 'despues';
  await page.screenshot({
    path: path.resolve(
      '../../test-artifacts/audit/evidencias/wt-a',
      `107_month_${phase}_${info.project.name.replace('wt-a-', '').replace('-', '_')}.png`,
    ),
  });
  if (phase === 'antes' || page.viewportSize()!.width > 768) return;
  await expect(page.locator('.calendar-cell-items .calendar-chip')).toHaveCount(0);
  const bar = page.locator('.calendar-month-span').first();
  await expect(bar).toBeVisible();
  expect((await bar.boundingBox())!.height).toBe(3);
  expect(await bar.evaluate((e) => getComputedStyle(e).fontSize)).toBe('0px');
  await expect(page.locator('[data-day="2026-10-29"] .cal-dots i')).toHaveCount(4);
  await page.locator('[data-day="2026-10-27"] > strong button').click();
  await expect(page.locator('.calendar-day-popover .agenda-card')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await page.locator('[data-day="2026-10-29"] > strong button').click();
  await expect(page.locator('.calendar-day-popover a.agenda-card')).toHaveCount(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );
});
