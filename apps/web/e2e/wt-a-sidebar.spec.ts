import path from 'node:path';
import { test, expect } from '@playwright/test';
import { wtAFixture } from './wt-a.fixture';
test('RF-1101 TTD-AUD-105: calendar source scroll and responsive filters', async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith('wt-a-'));
  await wtAFixture(page);
  await page.goto('/calendar/week?date=2026-10-22');
  const width = page.viewportSize()!.width;
  await page.evaluate(
    (theme) => (document.documentElement.dataset.theme = theme),
    info.project.name.endsWith('dark') ? 'dark' : 'light',
  );
  const phase = process.env.WT_A_PHASE ?? 'despues';
  await page.screenshot({
    path: path.resolve(
      '../../test-artifacts/audit/evidencias/wt-a',
      `105_sidebar_${phase}_${info.project.name.replace('wt-a-', '').replace('-', '_')}.png`,
    ),
  });
  if (phase === 'antes') return;
  const filter = page.locator('.calendar-filter-menu > button');
  if (width < 1024) {
    await expect(filter).toBeVisible();
    await filter.click();
  } else {
    await expect(filter).toBeHidden();
    const panel = page.locator('.calendar-sidebar > .calendar-sources');
    const mini = page.locator('.calendar-mini');
    const top = (await mini.boundingBox())!.y;
    const box = (await panel.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 800);
    await expect.poll(() => panel.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
    await panel.locator('details').last().scrollIntoViewIfNeeded();
    expect((await mini.boundingBox())!.y).toBeCloseTo(top, 0);
  }
  const panel = page.locator(
    width < 1024
      ? '.calendar-filter-popover .calendar-sources'
      : '.calendar-sidebar .calendar-sources',
  );
  const list = panel.getByRole('checkbox', { name: 'Lista 0', exact: true });
  await list.click();
  await expect(list).not.toBeChecked();
  await expect
    .poll(() =>
      panel
        .getByRole('checkbox', { name: 'Todo', exact: true })
        .evaluate((e) => (e as HTMLInputElement).indeterminate),
    )
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
});

test('RF-1101 TTD-AUD-105: tablet filter remains anchored at 900px', async ({ page }, info) => {
  test.skip(info.project.name !== 'wt-a-1280-light' || process.env.WT_A_PHASE === 'antes');
  await wtAFixture(page);
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto('/calendar/month?date=2026-10-28');
  const filter = page.locator('.calendar-filter-menu > button');
  await expect(filter).toBeVisible();
  await filter.click();
  await expect(page.locator('.calendar-filter-popover')).toBeVisible();
  await expect(page.locator('.calendar-filter-popover.is-bottom-sheet')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1280, height: 800 });
  const row = page.locator('.calendar-sidebar .calendar-source-row').first();
  expect((await row.boundingBox())!.height).toBe(32);
  const summary = page.locator('.calendar-sidebar summary').first();
  expect((await summary.boundingBox())!.height).toBe(32);
  await expect(summary).toContainText('25/25');
  await expect(page.locator('.cal-head').first()).toHaveText('Sem');
});
