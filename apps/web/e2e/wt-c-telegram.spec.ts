import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { wtCFixture, type State } from './wt-c.fixture';
const before = process.env.WT_C_CAPTURE_BEFORE === '1';
for (const state of ['none', 'token_saved', 'webhook_ok', 'linked', 'error'] as State[]) {
  test(`TTD-AUD-125: screenshot ${state}`, async ({ page }, info) => {
    test.skip(!info.project.name.startsWith('wt-c-'));
    await wtCFixture(page, state);
    await page.goto('/settings/integrations');
    const card = page.locator('.telegram-card');
    await expect(card).toBeVisible();
    if (!before)
      await expect(card.locator('.telegram-status')).toHaveAttribute('data-status', state);
    if (!before && (state === 'token_saved' || state === 'error'))
      await expect(card.getByText('Sin configurar', { exact: true })).toHaveCount(0);
    await card.scrollIntoViewIfNeeded();
    const width = info.project.use.viewport?.width ?? 1280;
    const theme = info.project.use.colorScheme ?? 'light';
    const folder = path.resolve('../../test-artifacts/audit/evidencias/wt-c');
    await mkdir(folder, { recursive: true });
    await page.screenshot({
      path: `${folder}/125_telegram-${state}_${before ? 'antes' : 'despues'}_${width}_${theme}.png`,
      fullPage: true,
    });
    if (!before && width < 1024) await expect(card.locator('.telegram-qr')).toHaveCount(0);
  });
}
test('TTD-AUD-125: connect, link, test, replace and remove with a fake Telegram', async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith('wt-c-') || before);
  const fixture = await wtCFixture(page);
  await page.goto('/settings/integrations');
  const card = page.locator('.telegram-card');
  await card.getByLabel('Token de BotFather').fill('synthetic-test-input');
  await card.getByRole('button', { name: 'Conectar bot', exact: true }).click();
  await expect(card.getByRole('link', { name: 'Abrir Telegram', exact: true })).toBeVisible();
  fixture.setState('linked');
  await page.clock.runFor(2200);
  await expect(card.locator('.telegram-status')).toHaveText('Conectado');
  await card.getByRole('button', { name: 'Probar', exact: true }).click();
  await expect(card.getByRole('status').filter({ hasText: 'Enviado' })).toBeVisible();
  await card.getByRole('button', { name: 'Reemplazar token', exact: true }).click();
  await card.getByLabel('Token de BotFather').fill('synthetic-replacement');
  await card.getByRole('button', { name: 'Reemplazar token', exact: true }).last().click();
  await expect(card.locator('.telegram-status')).toHaveText('Pendiente de vincular');
  await card.getByRole('button', { name: 'Quitar bot', exact: true }).click();
  await expect(card.locator('.telegram-status')).toHaveText('Sin configurar');
});
