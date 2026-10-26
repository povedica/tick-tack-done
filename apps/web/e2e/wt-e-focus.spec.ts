import { test, expect } from '@playwright/test';
import { wtEFixture, evidence } from './wt-e.fixture';
test.beforeEach(async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('wt-e'), 'Specific viewport evidence');
  await wtEFixture(page);
});
test('TTD-AUD-129 RF-1201: visible presets and inline validation', async ({ page }, info) => {
  await page.goto('/focus');
  const preset = page.locator('.focus-presets').getByRole('button', { name: '15', exact: true });
  await expect(preset).toBeVisible();
  expect((await preset.boundingBox())?.height).toBeGreaterThanOrEqual(27);
  expect((await preset.boundingBox())?.height).toBeLessThanOrEqual(29);
  await expect(page.getByRole('button', { name: '35', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await preset.click();
  await expect(page.getByRole('timer')).toContainText('15:00');
  await evidence(page, info, '129_focus');
  await page.goto('/settings/focus');
  await page.getByLabel('Duración del pomo', { exact: true }).fill('200');
  await expect(page.getByText('Entre 5 y 180, de 5 en 5')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeDisabled();
  await evidence(page, info, '129_settings');
  await page.getByLabel('Duración del pomo', { exact: true }).fill('45');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.goto('/focus');
  await expect(page.getByRole('timer')).toContainText('45:00');
});
