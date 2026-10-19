import { expect, test } from '@playwright/test';

const item = {
  id: '6a1b784e-6bf6-4b79-bcee-a1513f4f5f99',
  title: 'Año Nuevo',
  type: 'countdown',
  emoji: '🎇',
  target_date: '2027-01-01',
  repeat_rule: 'none',
  day_mode: 'standard',
  color: 'pink',
  notes: null,
  show_in_sidebar: true,
  show_in_smart_list: true,
  pinned: false,
  archived_at: null,
  days: 74,
  kind: 'until',
  effective_date: '2027-01-01',
  reminders: [],
};

test('RF-2451: muestra una tarjeta Countdown con los días calculados por la API', async ({
  page,
}) => {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    if (request.url().includes('/api/v1/countdowns') && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [item], next_cursor: null }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.goto('/countdowns');

  await expect(page.getByRole('heading', { name: 'Cuenta atrás' })).toBeVisible();
  await expect(page.getByText('Año Nuevo')).toBeVisible();
  await expect(page.getByText('74', { exact: true })).toBeVisible();
  await expect(page.getByText('Faltan 74 días · 01/01/2027')).toBeVisible();
});
