import { test, expect } from '@playwright/test';
import path from 'node:path';
import { wtAFixture, contrastRatio } from './wt-a.fixture';
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
      `130_overflow_${phase}_${info.project.name.replace('wt-a-', '').replace('-', '_')}.png`,
    ),
  });
  if (phase === 'antes') return;
  const panel = page.locator('.calendar-day-popover');
  await expect(panel).toBeVisible();
  await expect(panel.locator('a.agenda-card')).toHaveCount(6);
  const card = panel.locator('a.agenda-card').first();
  expect(await card.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  expect(await panel.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(
    await page
      .locator('.cal-cell')
      .first()
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  );
  const colors = await card.evaluate((e) => ({
    ink: getComputedStyle(e).color,
    bg: getComputedStyle(e.closest('.calendar-day-popover')!).backgroundColor,
  }));
  expect(contrastRatio(colors.ink, colors.bg)).toBeGreaterThanOrEqual(4.5);
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
  if (page.viewportSize()!.width >= 768) {
    await page.goto('/calendar/week?date=2026-10-29');
    const more = page.locator('.hour-allday-more').first();
    await more.click();
    await expect(page.locator('.calendar-day-popover a.agenda-card')).toHaveCount(6);
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();
  }
});
