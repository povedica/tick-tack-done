import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';
test('TTD-AUD-81: recurrence anchor warning stays next to the repeat selector', async ({
  page,
}) => {
  await r80Fixture(page, { anchorWarning: true });
  await page.goto('/today?task=task');
  const warning = page.locator('.recurrence-anchor-warning');
  await expect(warning).toContainText('26');
  await expect(warning).toContainText('La fecha no coincide');
  const selector = page.locator('.detail-repeat-selector');
  const control = await selector.boundingBox();
  const box = await warning.boundingBox();
  expect(control).not.toBeNull();
  expect(box).not.toBeNull();
  expect(Math.abs(box!.y - control!.y - control!.height)).toBeLessThanOrEqual(5);
  await expect(warning).toHaveCSS('font-size', '12px');
});
