import { test, expect } from '@playwright/test';
import path from 'node:path';
import { wtAFixture } from './wt-a.fixture';
test('RF-1102 TTD-AUD-131: compact blocks retain their clock', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('wt-a-'));
  await wtAFixture(page);
  await page.goto('/calendar/day?date=2026-10-28');
  const compact = page.locator('[data-task-id="block-30"]');
  await compact.scrollIntoViewIfNeeded();
  const phase = process.env.WT_A_PHASE ?? 'despues';
  await page.screenshot({
    path: path.resolve(
      '../../test-artifacts/audit/evidencias/wt-a',
      `131_blocks_${phase}_${info.project.name}.png`,
    ),
  });
  if (phase === 'antes') return;
  const clock = compact.locator('.hour-task-time');
  await expect(clock).toBeVisible();
  const block = (await compact.boundingBox())!;
  const time = (await clock.boundingBox())!;
  expect(time.x + time.width).toBeLessThanOrEqual(block.x + block.width);
  await expect(page.locator('[data-task-id="block-15"] .hour-task-time')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );
});
