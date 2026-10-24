import { test, expect } from '@playwright/test';
import { wtEFixture, evidence } from './wt-e.fixture';
test('TTD-AUD E: baseline screenshots', async ({ page }, info) => {
  test.setTimeout(90_000);
  test.skip(
    process.env.WT_E_BEFORE !== '1' || !info.project.name.startsWith('wt-e'),
    'Baseline evidence only',
  );
  await wtEFixture(page, { anchorWarning: true, drive: true });
  for (const [id, path] of [
    ['129_focus', '/focus'],
    ['129_settings', '/settings/focus'],
    ['134_anchor', '/today?task=task'],
    ['126_weekly', '/reports/weekly'],
    ['127_google', '/settings/integrations'],
  ] as const) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    if (id === '129_settings')
      await page.getByLabel('Duración del pomo', { exact: true }).fill('200');
    if (id === '134_anchor') await expect(page.locator('.recurrence-anchor-warning')).toBeVisible();
    await evidence(page, info, id, 'antes');
  }
});
