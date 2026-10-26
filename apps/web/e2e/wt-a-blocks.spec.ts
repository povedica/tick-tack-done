import { test, expect } from '@playwright/test';
import path from 'node:path';
import { wtAFixture } from './wt-a.fixture';
test('RF-1102 TTD-AUD-131: compact blocks retain their clock', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('wt-a-'));
  await wtAFixture(page);
  await page.goto(
    page.viewportSize()!.width >= 768
      ? '/calendar/week?date=2026-10-28'
      : '/calendar/day?date=2026-10-28',
  );
  const compact = page.locator('[data-task-id="block-30"]');
  await compact.scrollIntoViewIfNeeded();
  const phase = process.env.WT_A_PHASE ?? 'despues';
  await page.screenshot({
    path: path.resolve(
      '../../test-artifacts/audit/evidencias/wt-a',
      `131_blocks_${phase}_${info.project.name.replace('wt-a-', '').replace('-', '_')}.png`,
    ),
  });
  const otherView = page.viewportSize()!.width >= 768 ? 'day' : 'week';
  const captureOther = async () => {
    await page.goto(`/calendar/${otherView}?date=2026-10-28`);
    await page.locator('.calendar-page a[href*="task=block-30"]').first().waitFor();
    await page.screenshot({
      path: path.resolve(
        '../../test-artifacts/audit/evidencias/wt-a',
        `131_${otherView}_${phase}_${info.project.name.replace('wt-a-', '').replace('-', '_')}.png`,
      ),
    });
  };
  if (phase === 'antes') {
    await captureOther();
    return;
  }
  const clock = compact.locator('.hour-task-time');
  await expect(clock).toBeVisible();
  const block = (await compact.boundingBox())!;
  const time = (await clock.boundingBox())!;
  expect(time.x + time.width).toBeLessThanOrEqual(block.x + block.width);
  await expect(page.locator('[data-task-id="block-15"] .hour-task-time')).toHaveCount(0);
  const regular = page.locator('[data-task-id="block-60"]');
  await expect(regular.locator('.hour-task-time')).toBeVisible();
  const regularBox = (await regular.boundingBox())!,
    regularTime = (await regular.locator('.hour-task-time').boundingBox())!;
  expect(regularTime.x + regularTime.width).toBeLessThanOrEqual(regularBox.x + regularBox.width);
  for (const duration of [15, 30, 60]) {
    const text = page.locator(`[data-task-id="block-${duration}"] > a`);
    const metrics = await text.evaluate((e) => ({
      scroll: e.scrollHeight,
      client: e.clientHeight,
    }));
    expect(metrics.scroll, `block${duration}`).toBeLessThanOrEqual(metrics.client);
  }
  if (page.viewportSize()!.width >= 768) {
    await page.goto('/calendar/week?date=2026-10-28');
    const short = page.locator('[data-task-id="block-30"]');
    await short.scrollIntoViewIfNeeded();
    await expect(short.locator('.hour-task-time')).toBeVisible();
    expect(
      await short.locator('.hour-task-title').evaluate((e) => e.scrollWidth > e.clientWidth),
    ).toBe(true);
    const a = (await short.boundingBox())!,
      t = (await short.locator('.hour-task-time').boundingBox())!;
    expect(t.x + t.width).toBeLessThanOrEqual(a.x + a.width);
  }

  if (page.viewportSize()!.width < 768) {
    await page.goto('/calendar/multi-day?date=2026-10-28');
    const short = page.locator('[data-task-id="block-30"]');
    await short.scrollIntoViewIfNeeded();
    await expect(short.locator('.hour-task-time')).toBeVisible();
    const a = (await short.boundingBox())!,
      t = (await short.locator('.hour-task-time').boundingBox())!;
    expect(t.x + t.width).toBeLessThanOrEqual(a.x + a.width);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );
  await captureOther();
});
