import { test, expect } from '@playwright/test';
import path from 'node:path';
import { wtAFixture } from './wt-a.fixture';
test('RF-601 TTD-AUD-132: date actions remain in the visible sheet', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('wt-a-'));
  await wtAFixture(page);
  await page.goto('/calendar/week?date=2026-10-22');
  await page.locator('.calendar-period > button').click();
  const panel = page.locator('.date-popover');
  const phase = process.env.WT_A_PHASE ?? 'despues';
  await page.screenshot({
    path: path.resolve(
      '../../test-artifacts/audit/evidencias/wt-a',
      `132_date_${phase}_${info.project.name}.png`,
    ),
  });
  if (phase === 'antes') return;
  if (page.viewportSize()!.width <= 768) {
    const footer = panel.locator('.sheet-footer');
    await expect(footer).toBeVisible();
    const bottom = (await footer.boundingBox())!;
    expect(bottom.y + bottom.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    const y = bottom.y;
    await panel.locator('.sheet-body').evaluate((e) => (e.scrollTop = e.scrollHeight));
    expect((await footer.boundingBox())!.y).toBeCloseTo(y, 0);
    await page.setViewportSize({ width: 390, height: 500 });
    await expect
      .poll(async () => {
        const b = (await footer.boundingBox())!;
        return b.y + b.height;
      })
      .toBeLessThanOrEqual(500);
  } else {
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
});
