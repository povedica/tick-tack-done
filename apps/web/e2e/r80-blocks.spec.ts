import path from 'node:path';
import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';
for (const minutes of [15, 30, 60])
  test(`TTD-AUD-89 ${minutes} minutes clips text inside its block`, async ({ page }, info) => {
    await r80Fixture(page, { duration: minutes });
    await page.goto('/calendar/day?date=2026-10-22');
    const block = page.locator('.calendar-hour-task').first();
    await expect(block).toBeAttached();
    await block.scrollIntoViewIfNeeded();
    const theme = info.project.name.endsWith('dark') ? 'dark' : 'light';
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    if (process.env.R80_PHASE === 'antes') {
      await page.screenshot({
        path: path.resolve(
          '../../docs/audit/evidencias/r80',
          `89_bloque-${minutes}_antes_${info.project.name.replace('-', '_')}.png`,
        ),
      });
      return;
    }
    const link = block.locator('a');
    expect(
      await link.evaluate((node) => node.scrollHeight - node.clientHeight),
    ).toBeLessThanOrEqual(1);
    await expect(link).toHaveAttribute('title', /Tarea sintética/);
    await expect(link).toHaveAttribute('aria-label', /Tarea sintética/);
    await page.screenshot({
      path: path.resolve(
        '../../docs/audit/evidencias/r80',
        `89_bloque-${minutes}_despues_${info.project.name.replace('-', '_')}.png`,
      ),
    });
  });
