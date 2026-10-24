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
      `133_period_${phase}_${info.project.name}.png`,
    ),
  });
  if (phase === 'antes') return;
  await expect(button).toContainText('28/10/2026');
  const panel = page.locator('.date-popover');
  await expect(
    panel.locator('.date-shortcuts,.inline-time-row,.popover-tabs,.popover-row'),
  ).toHaveCount(0);
  await panel.locator('[data-date="2026-11-05"]').click();
  await expect(page).toHaveURL(/date=2026-11-05/);
  await page.goto('/reports/weekly');
  await expect(page.locator('.week-range > button').first()).toBeVisible();
});
