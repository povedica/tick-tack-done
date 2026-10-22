import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';
for (const route of ['/today', '/list/list']) test(`TTD-AUD-91 detail collapses ${route}`, async ({page}, info) => {
  await r80Fixture(page); await page.goto(route);
  await expect(page.locator('.detail-empty')).toHaveCount(0);
  if (info.project.name.startsWith('desktop')) {
    const center = await page.locator('.center').boundingBox();
    const sidebar = await page.locator('.sidebar').boundingBox();
    const rail = await page.locator('.icon-rail').boundingBox();
    expect(Math.abs((center?.width ?? 0) - (1280 - (sidebar?.width ?? 0) - (rail?.width ?? 0)))).toBeLessThanOrEqual(1);
  }
  const row = page.locator('[data-task-id="task"]').first();
  await row.click(); await expect(page.locator('.detail-panel')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('.detail-slot')).toHaveCount(0);
  await expect(row).toBeFocused();
});
