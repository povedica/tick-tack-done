import { expect, test } from '@playwright/test';

test('RF-2653: el cierre muestra lo hecho y deja cerrar el día', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    if (
      url.includes('/planning/shutdown/sessions') &&
      route.request().method() === 'POST' &&
      !url.includes('/apply')
    ) {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '11111111-1111-4111-8111-111111111111',
          revision: 1,
          kind: 'shutdown',
          review: { done_today: [{ id: 'a', title: 'Comida' }], focus_minutes: 25 },
          queue: {
            cards: [
              {
                task_id: '22222222-2222-4222-8222-222222222222',
                title: 'Informe',
                suggested: null,
              },
              {
                task_id: '33333333-3333-4333-8333-333333333333',
                title: 'Llamada',
                suggested: null,
              },
            ],
          },
        }),
      });
      return;
    }
    if (url.includes('/apply')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ applied: true, closed: true, effects: [] }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/cierre');
  await expect(page.getByRole('heading', { name: 'Cerrar el día' })).toBeVisible();
  await expect(page.getByText('Informe')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar el día' }).click();
  await expect(page.getByText('Día cerrado')).toBeVisible();
});
