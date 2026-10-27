import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';

test('integrations fit a 375×667 phone and open the action sheet', async ({ page }, info) => {
  test.skip(
    info.project.name !== 'desktop-light' && info.project.name !== 'chromium',
    'One mobile viewport is enough',
  );
  await r80Fixture(page, { drive: true, telegramState: 'linked' });
  await page.route('**/api/v1/me/inbound-email', (route) =>
    route.fulfill({ json: { active: false } }),
  );
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/settings/integrations');
  await expect(page.getByRole('heading', { name: 'Integraciones', exact: true })).toBeVisible();
  await expect(page.getByText('Servicios conectados a ttd y qué pueden hacer.')).toBeVisible();
  const google = page.getByRole('article', { name: 'Google', exact: true });
  const telegram = page.getByRole('article', { name: 'Telegram', exact: true });
  const mail = page.getByRole('article', { name: 'Correo a tarea', exact: true });
  await expect(google.getByRole('button', { name: 'Cambiar permisos' })).toHaveCount(0);
  await expect(mail.getByRole('button', { name: 'Generar dirección', exact: true })).toBeVisible();
  await expect(mail.getByRole('button', { name: 'Más acciones', exact: true })).toHaveCount(0);
  await expect(page.getByText('Parada')).toBeVisible();
  const scrolled = await page.evaluate(
    () => document.documentElement.scrollHeight <= window.innerHeight + 1,
  );
  expect(scrolled).toBe(true);
  await page.screenshot({ path: info.outputPath('mobile-375.png') });
  await telegram.getByRole('button', { name: 'Más acciones', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Telegram' });
  await expect(sheet.getByRole('button', { name: /Probar/ })).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: 'Desvincular Telegram', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('mobile-375-sheet.png') });
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(google.getByRole('button', { name: 'Cambiar permisos', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('desktop-1280.png') });
});
