import { test, expect } from '@playwright/test';
import path from 'node:path';
import { wtAFixture } from './wt-a.fixture';
test('RF-1101 TTD-AUD-130: overflow is anchored with restored focus', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('wt-a-'));
  await wtAFixture(page);
  await page.goto('/calendar/two-weeks?date=2026-10-29');
  const button = page.locator('[data-day="2026-10-29"] .calendar-overflow');
  await expect(button).toBeVisible();
  await button.click();
  const phase = process.env.WT_A_PHASE ?? 'despues';
  await page.screenshot({
    path: path.resolve(
      '../../test-artifacts/audit/evidencias/wt-a',
      `130_overflow_${phase}_${info.project.name}.png`,
    ),
  });
  if (phase === 'antes') return;
  const panel = page.locator('.calendar-day-popover');
  await expect(panel).toBeVisible();
  await expect(panel.locator('a.agenda-card')).toHaveCount(6);
  await expect(page.locator('dialog:modal')).toHaveCount(0);
  const box = (await panel.boundingBox())!;
  const anchor = (await button.boundingBox())!;

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  if (page.viewportSize()!.width >= 768) {
    expect(
      Math.min(Math.abs(box.y - anchor.y - anchor.height), Math.abs(box.y + box.height - anchor.y)),
    ).toBeLessThanOrEqual(8);
  } else {
    expect(box.x).toBe(0);
    expect(box.width).toBe(page.viewportSize()!.width);
  }
  await page.keyboard.press('Escape');
  await expect(button).toBeFocused();
});
