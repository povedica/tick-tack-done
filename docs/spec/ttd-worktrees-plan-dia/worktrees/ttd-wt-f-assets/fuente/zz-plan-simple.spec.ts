import path from 'node:path';
import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';
const OUT = '/workspace/ttd-audit/plan-del-dia/ttd-simple/raw';
test('simple', async ({ page }, info) => {
  const mob = info.project.name === 'mobile';
  await r80Fixture(page, {});
  for (const v of mob ? ['m1', 'm2', 'm3', 'm4'] : ['d1', 'd2', 'd3']) {
    await page.goto(`/plan/mock?simple=${v}`);
    await expect(page.locator('.sp-page, .sm-page')).toBeVisible();
    if (!mob) { const sb = page.locator('.sidebar').first(); if (await sb.isVisible().catch(() => false)) { await page.locator('body').press('['); await page.waitForTimeout(300); } }
    await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: path.join(OUT, `${v}.png`), animations: 'disabled' });
  }
});
