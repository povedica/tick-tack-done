import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';

for (const width of [390, 768, 1280])
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`${width} ${colorScheme}`, () => {
      test.use({ viewport: { width, height: 844 }, colorScheme });
      test('RF-1602: account forms stay inline and settings navigation remains reachable', async ({
        page,
      }) => {
        await r80Fixture(page);
        await page.goto('/settings/account');
        await expect(page.getByRole('heading', { name: 'Cuenta', exact: true })).toBeVisible();
        const forms = page.locator('.settings-main .token-form');
        await expect(forms.first()).toBeVisible();
        for (const form of await forms.all())
          expect(await form.evaluate((node) => getComputedStyle(node).position)).not.toBe('fixed');
        if (width <= 800) await page.getByRole('link', { name: '‹ Ajustes', exact: true }).click();
        else await page.goto('/settings');
        const navigation = page.getByRole('navigation', { name: 'Ajustes', exact: true });
        await navigation.getByRole('link', { name: 'Captura', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Captura', exact: true })).toBeVisible();
        if (width <= 800) await page.getByRole('link', { name: '‹ Ajustes', exact: true }).click();
        await navigation.getByRole('link', { name: 'Tiempo de Foco', exact: true }).click();
        await expect(
          page.getByRole('heading', { name: 'Tiempo de Foco', exact: true }),
        ).toBeVisible();
        if (width < 640) {
          await page.locator('.bottom-bar').getByRole('link', { name: 'Hoy', exact: true }).click();
          await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible();
          await page
            .locator('.bottom-bar')
            .getByRole('button', { name: 'Más', exact: true })
            .click();
          await page
            .locator('.sidebar')
            .getByRole('link', { name: 'Ajustes', exact: true })
            .click();
          await expect(page).toHaveURL(/\/settings$/);
          await expect(navigation).toBeVisible();
        }
      });
    });
  }
