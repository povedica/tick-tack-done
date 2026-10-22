import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';
test('TTD-AUD-103: guided link, 160px desktop QR, live pairing and confirmed unlink', async ({
  page,
}, info) => {
  await r80Fixture(page);
  let linked = false;
  let deletes = 0;
  await page.route('**/integrations/telegram', (route) => {
    if (route.request().method() === 'DELETE') {
      linked = false;
      deletes++;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({
      json: {
        configured: true,
        linked,
        bot_username: 'synthetic_bot',
        username: linked ? 'test' : null,
        display_name: 'Synthetic',
        linked_at: '2026-10-22T10:00:00Z',
        status: linked ? 'connected' : 'not_linked',
        enabled: true,
      },
    });
  });
  await page.goto('/settings/integrations');
  const open = page.getByRole('link', { name: 'Abrir Telegram', exact: true });
  await expect(open).toHaveAttribute('href', /^https:\/\/t\.me\/synthetic_bot\?start=/);
  if (info.project.name.startsWith('mobile')) {
    await expect(page.getByRole('img', { name: 'Código QR para abrir Telegram' })).toHaveCount(0);
    expect((await open.boundingBox())!.height).toBe(44);
  } else {
    const qr = page.getByRole('img', { name: 'Código QR para abrir Telegram' });
    await expect(qr).toBeVisible();
    const box = (await qr.boundingBox())!;
    expect(Math.abs(box.width - 160)).toBeLessThanOrEqual(2);
    expect(Math.abs(box.height - 160)).toBeLessThanOrEqual(2);
  }
  linked = true;
  await expect(page.getByText('Conectado como @test (Synthetic)', { exact: true })).toBeVisible({
    timeout: 3000,
  });
  await page.getByRole('button', { name: 'Desvincular Telegram', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Desvincular Telegram', exact: true }),
  ).toBeVisible();
  expect(deletes).toBe(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(deletes).toBe(0);
  await page.getByRole('button', { name: 'Desvincular Telegram', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Desvincular', exact: true }).click();
  await expect(open).toBeVisible();
  expect(deletes).toBe(1);
});
