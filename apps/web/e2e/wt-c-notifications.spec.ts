import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { wtCFixture, type State } from './wt-c.fixture';
const before = process.env.WT_C_CAPTURE_BEFORE === '1';
for (const state of [
  'none',
  'token_saved',
  'webhook_ok',
  'linked',
  'blocked',
  'error',
] as State[]) {
  test(`TTD-AUD-135: notification matrix ${state}`, async ({ page }, info) => {
    test.skip(!info.project.name.startsWith('wt-c-'));
    await wtCFixture(page, state);
    await page.goto('/settings/notifications');
    const matrix = page.getByRole('table');
    await expect(matrix).toBeVisible();
    const push = matrix.getByRole('columnheader').nth(1);
    const telegram = matrix.getByRole('columnheader').nth(3);
    if (!before) {
      await expect(push).toContainText('No configurado en el servidor');
      await expect(push.getByRole('button', { name: 'Probar' })).toBeDisabled();
      await expect(telegram.locator('.notification-channel-state')).toHaveAttribute(
        'data-state',
        state,
      );
      await expect(telegram.locator('.notification-channel-state')).not.toHaveText('@');
      expect(await matrix.evaluate((table) => table.scrollWidth <= table.clientWidth + 1)).toBe(
        true,
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    const folder = path.resolve('../../test-artifacts/audit/evidencias/wt-c');
    await mkdir(folder, { recursive: true });
    await page.screenshot({
      path: `${folder}/135_notifications-${state}_${before ? 'antes' : 'despues'}_${info.project.use.viewport?.width}_${info.project.use.colorScheme}.png`,
      fullPage: true,
    });
  });
}
