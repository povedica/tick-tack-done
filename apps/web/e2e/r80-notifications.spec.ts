import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';
test('TTD-AUD-102: complete matrix fits, switches measure 44/32/18 and tests only the chosen channel', async ({
  page,
}) => {
  await r80Fixture(page);
  const preferences = [{ kind: 'task', channel: 'push', enabled: true }];
  await page.route('**/me/notifications/settings', (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      if (body.preferences) preferences.splice(0, preferences.length, ...body.preferences);
    }
    return route.fulfill({
      json: {
        preferences,
        channels: {
          push: { configured: true },
          email: { address: 'synthetic@example.test' },
          telegram: { linked: false, status: 'not_linked' },
        },
        quiet_hours: { start: null, end: null, days: [], allow_high: false },
      },
    });
  });
  let channel = '';
  await page.route('**/me/notifications/test', (route) => {
    channel = route.request().postDataJSON().channel;
    return route.fulfill({ json: { sent: true } });
  });
  await page.goto('/settings/notifications');
  const matrix = page.getByRole('table', { name: 'Canales por tipo de aviso' });
  await expect(matrix.getByRole('switch')).toHaveCount(24);
  const toggle = page.getByRole('switch', { name: 'Recordatorios de tareas · Push', exact: true });
  await expect(toggle).toBeChecked();
  const hit = (await toggle.boundingBox())!;
  expect(Math.abs(hit.width - 44)).toBeLessThanOrEqual(1);
  expect(Math.abs(hit.height - 44)).toBeLessThanOrEqual(1);
  const visible = (await toggle.locator('span').boundingBox())!;
  expect(Math.abs(visible.width - 32)).toBeLessThanOrEqual(1);
  expect(Math.abs(visible.height - 18)).toBeLessThanOrEqual(1);
  expect(await matrix.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(
    matrix
      .getByRole('columnheader', { name: /Telegram/ })
      .getByRole('button', { name: 'Probar', exact: true }),
  ).toBeDisabled();
  await matrix
    .getByRole('columnheader', { name: /Email/ })
    .getByRole('button', { name: 'Probar', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText('Enviado ✓');
  expect(channel).toBe('email');
});
