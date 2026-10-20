import { expect, test } from '@playwright/test';

test('RF-2671: replanificar muestra la propuesta y permite aplicarla', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    if (
      url.includes('/planning/replan/sessions') &&
      route.request().method() === 'POST' &&
      !url.includes('/apply')
    ) {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '11111111-1111-4111-8111-111111111111',
          revision: 1,
          kind: 'replan',
          load: {
            today: { status: 'overload', task_minutes: 600, available_minutes: 540 },
            tomorrow: { status: 'ok' },
          },
          queue: {
            cards: [
              {
                task_id: '22222222-2222-4222-8222-222222222222',
                title: 'Informe',
                suggested: {
                  decision: 'plan_day',
                  target_date: '2026-10-21',
                  reason: 'Mañana todavía cabe.',
                },
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
        body: JSON.stringify({ applied: true, closed: true }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/replan');
  await expect(page.getByRole('heading', { name: 'Replanificar el día' })).toBeVisible();
  await expect(page.getByText('Mañana todavía cabe.')).toBeVisible();
  await page.getByRole('button', { name: 'Aplicar propuesta tal cual' }).click();
  await expect(page.getByText('Día cerrado')).toBeVisible();
});
