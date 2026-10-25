import { expect, test } from '@playwright/test';
import { captureSettings } from '@reflexionia/domain';
import { r80Fixture } from './r80.fixture';

for (const width of [360, 390, 768, 1280])
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`${width} ${colorScheme}`, () => {
      test.use({ viewport: { width, height: 844 }, colorScheme });
      test('RF-102: capture defaults save across reload and keep recognition controls independent', async ({
        page,
      }) => {
        await r80Fixture(page);
        let settings = captureSettings(null);
        await page.route(
          (url) => url.pathname === '/api/v1/me',
          async (route) => {
            if (route.request().method() === 'PATCH')
              settings = captureSettings(route.request().postDataJSON().capture_settings);
            await route.fulfill({
              json: {
                id: 'user',
                display_name: 'Prueba',
                email: 'test@example.test',
                locale: 'es',
                nlp_language: 'es',
                time_zone: 'Europe/Madrid',
                capture_settings: settings,
                features: {},
              },
            });
          },
        );
        await page.goto('/settings/capture');
        await expect(page.getByRole('heading', { name: 'Captura', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeDisabled();
        await page.getByRole('switch', { name: 'Reconocer fechas y horas', exact: true }).uncheck();
        await expect(
          page.getByRole('switch', {
            name: 'Retirar del título el texto de fecha reconocido',
            exact: true,
          }),
        ).toBeDisabled();
        await page
          .getByRole('switch', { name: 'Retirar las etiquetas del título', exact: true })
          .uncheck();
        await page
          .getByRole('combobox', { name: 'Prioridad predeterminada', exact: true })
          .selectOption('high');
        await page
          .getByRole('combobox', { name: 'Fecha predeterminada', exact: true })
          .selectOption('tomorrow');
        await page
          .getByRole('combobox', { name: 'Modo de fecha', exact: true })
          .selectOption('date_time');
        await page.getByRole('textbox', { name: 'Hora predeterminada', exact: true }).fill('09:30');
        await page
          .getByRole('combobox', { name: 'Duración predeterminada', exact: true })
          .selectOption('60');
        await page
          .getByRole('combobox', { name: 'Añadir tareas nuevas', exact: true })
          .selectOption('top');
        await page.getByRole('button', { name: 'Guardar', exact: true }).click();
        await expect.poll(() => settings.default_priority).toBe('high');
        await page.reload();
        await expect(
          page.getByRole('combobox', { name: 'Prioridad predeterminada', exact: true }),
        ).toHaveValue('high');
        await expect(
          page.getByRole('switch', { name: 'Reconocer fechas y horas', exact: true }),
        ).not.toBeChecked();
        await expect(
          page.getByRole('switch', { name: 'Retirar las etiquetas del título', exact: true }),
        ).not.toBeChecked();
        await expect(
          page.getByRole('textbox', { name: 'Hora predeterminada', exact: true }),
        ).toHaveValue('09:30');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      });
    });
  }
