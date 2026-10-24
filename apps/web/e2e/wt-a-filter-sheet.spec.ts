import { test, expect } from '@playwright/test';
import path from 'node:path';
import { wtAFixture } from './wt-a.fixture';
test('RF-1101 TTD-AUD-106: fixed filter header and square checkboxes', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('wt-a-') || page.viewportSize()!.width > 768);
  await wtAFixture(page);
  await page.goto('/calendar/month?date=2026-10-22');
  await page.locator('.calendar-filter-menu > button').click();
  const phase = process.env.WT_A_PHASE ?? 'despues';
  await page.screenshot({
    path: path.resolve(
      '../../test-artifacts/audit/evidencias/wt-a',
      `106_filters_${phase}_${info.project.name}.png`,
    ),
  });
  if (phase === 'antes') return;
  const panel = page.locator('.calendar-filter-popover');
  const header = panel.locator('.sheet-header');
  const top = (await header.boundingBox())!.y;
  await panel.locator('.sheet-body').evaluate((e) => (e.scrollTop = e.scrollHeight));
  expect((await header.boundingBox())!.y).toBeCloseTo(top, 0);
  const done = header.getByRole('button', { name: 'Listo' });
  const box = (await done.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  const check = panel.locator('input:checked').first();
  expect(await check.evaluate((e) => parseFloat(getComputedStyle(e).borderRadius))).toBeLessThan(9);
  await done.click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator('.calendar-filter-menu > button')).toBeFocused();
});
