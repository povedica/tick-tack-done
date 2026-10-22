import path from 'node:path';
import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';

test('TTD-AUD-93: calendar source sections persist and filter locally', async ({ page }, info) => {
  await r80Fixture(page, { filtering: true });
  await page.goto('/calendar/week?date=2026-10-22');
  const mobile = info.project.name.startsWith('mobile');
  if (mobile) await page.locator('.calendar-filter-menu > button').click();
  const panel = page.locator(
    mobile ? '.calendar-filter-popover .calendar-sources' : '.calendar-sidebar .calendar-sources',
  );
  await expect(panel.locator('details')).toHaveCount(5);
  const row = panel.getByRole('checkbox', { name: 'Lista sintética', exact: true });
  const box = await row.locator('..').boundingBox();
  expect(Math.abs(box!.height - (mobile ? 44 : 32))).toBeLessThanOrEqual(1);
  await expect(row).toBeChecked();
  await expect(page.locator('.center a[href*="task=task"]')).toHaveCount(1);
  await row.click();
  await expect(row).not.toBeChecked({ timeout: 200 });
  await expect(page).toHaveURL(/lists=-/);
  if (mobile) await page.keyboard.press('Escape');
  await expect(page.locator('.center a[href*="task=task"]')).toHaveCount(0, { timeout: 200 });
  await page.reload();
  if (mobile) await page.locator('.calendar-filter-menu > button').click();
  await expect(
    panel.getByRole('checkbox', { name: 'Lista sintética', exact: true }),
  ).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('ttd.calendar.filters'))).toContain(
    'lists',
  );
});

test('TTD-AUD-93: shared period selector has no native date input', async ({ page }, info) => {
  await r80Fixture(page, { filtering: true });
  await page.goto('/calendar/week?date=2026-10-22');
  await page.locator('.calendar-period > button').click();
  await expect(page.getByRole('dialog').first()).toBeVisible();
  await page.evaluate(
    (theme) => (document.documentElement.dataset.theme = theme),
    info.project.name.endsWith('dark') ? 'dark' : 'light',
  );
  const phase = process.env.R80_PHASE ?? 'antes';
  await page.screenshot({
    path: path.resolve(
      '../../test-artifacts/audit/evidencias/r80',
      `93_periodo_${phase}_${info.project.name.replace('-', '_')}.png`,
    ),
    animations: 'disabled',
  });
  await expect(page.locator('input[type=date]')).toHaveCount(0);
  await expect(page.locator('.date-popover')).toBeVisible();
});
