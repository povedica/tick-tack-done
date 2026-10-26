import { test, expect } from '@playwright/test';
import path from 'node:path';
import { wtAFixture, contrastRatio } from './wt-a.fixture';
test('RF-1101 TTD-AUD-106: fixed filter header and square checkboxes', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('wt-a-') || page.viewportSize()!.width > 768);
  await wtAFixture(page);
  await page.goto('/calendar/month?date=2026-10-22');
  await page.locator('.calendar-filter-menu > button').click();
  const phase = process.env.WT_A_PHASE ?? 'despues';
  await page.screenshot({
    path: path.resolve(
      '../../test-artifacts/audit/evidencias/wt-a',
      `106_filters_${phase}_${info.project.name.replace('wt-a-', '').replace('-', '_')}.png`,
    ),
  });
  if (phase === 'antes') return;
  const panel = page.locator('.calendar-filter-popover');
  const header = panel.locator('.sheet-header');
  const top = (await header.boundingBox())!.y;
  await panel.locator('.sheet-body').evaluate((e) => (e.scrollTop = e.scrollHeight));
  expect((await header.boundingBox())!.y).toBeCloseTo(top, 0);
  const body = panel.locator('.sheet-body');
  expect(
    await body.evaluate((e) => parseFloat(getComputedStyle(e).paddingBottom)),
  ).toBeGreaterThanOrEqual(
    await body.evaluate((e) => parseFloat(getComputedStyle(e).getPropertyValue('--sp-3'))),
  );
  const last = panel.locator('.calendar-source-row:visible').last();
  const lastBox = (await last.boundingBox())!;
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  const done = header.getByRole('button', { name: 'Listo' });
  const box = (await done.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  const check = panel.locator('input:checked').first();
  expect(await check.evaluate((e) => parseFloat(getComputedStyle(e).borderRadius))).toBeLessThan(9);
  const colors = await check.evaluate((e) => ({
    bg: getComputedStyle(e).backgroundColor,
    panel: getComputedStyle(e.closest('.calendar-filter-popover')!).backgroundColor,
  }));
  expect(contrastRatio(colors.bg, colors.panel)).toBeGreaterThanOrEqual(3);
  await done.click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator('.calendar-filter-menu > button')).toBeFocused();
});
