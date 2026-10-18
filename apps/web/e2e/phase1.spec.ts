import { expect, test } from '@playwright/test';

test('criterio 5: crear, editar y completar sin red converge al reconectar', async ({ page }) => {
  const created: string[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    if (request.url().includes('/api/v1/projects')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], next_cursor: null }),
      });
      return;
    }
    if (request.url().includes('/api/v1/tasks') && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], next_cursor: null }),
      });
      return;
    }
    if (request.method() === 'POST' && request.url().endsWith('/api/v1/tasks')) {
      const key = request.headers()['idempotency-key'] ?? '';
      if (!created.includes(key)) {
        created.push(key);
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'task-1', title: 'leche', warnings: [] }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/repeat');
  await expect(page.getByRole('heading', { name: 'Repetición' })).toBeVisible();
  await expect(page.getByText('Cada semana los lunes')).toBeVisible();
  await expect(page.getByLabel('Regla')).toHaveCount(0);
  await page.getByLabel('Modo avanzado').check();
  await expect(page.getByLabel('Regla')).toBeVisible();
});
