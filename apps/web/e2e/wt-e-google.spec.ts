import { test, expect } from '@playwright/test';
import { wtEFixture, evidence } from './wt-e.fixture';
test('TTD-AUD-127 RF-2004/2005: one card and explicit disconnect effects', async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith('wt-e'), 'Specific viewport evidence');
  await wtEFixture(page, { drive: true });
  let connected = true;
  const bodies: unknown[] = [];
  await page.route('**/api/v1/integrations/{google,drive}', async (route) => {
    if (route.request().method() === 'DELETE') {
      bodies.push(new URL(route.request().url()).search);
      connected = false;
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({
      json: {
        has_connection: connected,
        connected,
        configured: true,
        authorized: connected,
        enabled: connected,
        status: connected ? 'connected' : 'disconnected',
        account: connected ? 'synthetic@example.test' : null,
      },
    });
  });
  await page.goto('/settings/integrations');
  await expect(page.getByRole('heading', { name: /Google/ })).toHaveCount(1);
  await expect(page.getByText('synthetic@example.test')).toBeVisible();
  await expect(page.getByRole('switch', { name: /Google/ })).toHaveCount(2);
  const google = page.getByRole('article', { name: 'Google', exact: true });
  await google.getByRole('button', { name: 'Más acciones', exact: true }).click();
  await page.getByRole('button', { name: 'Desconectar Google', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Los adjuntos siguen en tu Drive');
  await evidence(page, info, '127_google');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(bodies).toEqual([]);
  await google.getByRole('button', { name: 'Más acciones', exact: true }).click();
  await page.getByRole('button', { name: 'Desconectar Google', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Desconectar', exact: true })
    .click();
  await expect(page.getByText(/Google desconectado/)).toBeVisible();
  expect(bodies).toEqual(['']);
  await expect(page.getByRole('link', { name: 'myaccount.google.com/permissions' })).toBeVisible();
  await page.goto('/today?task=task');
  await expect(page.locator('.attachment-chip')).toHaveAttribute(
    'href',
    'https://drive.google.com/file/d/synthetic/view',
  );
  await expect(page.locator('.detail-attach-btn input[type="file"]')).toBeDisabled();
  await page
    .getByRole('complementary', { name: 'Tarea', exact: true })
    .getByRole('button', { name: 'Más acciones', exact: true })
    .click();
  const attach = page.getByRole('menuitem', { name: /Adjuntar/ });
  await expect(attach).toBeDisabled();
  await expect(attach).toHaveAttribute(
    'title',
    'Para adjuntar ficheros, Google Drive debe estar activo.',
  );
  await expect(
    page.getByText('Para adjuntar ficheros, Google Drive debe estar activo.', { exact: true }),
  ).toBeVisible();
  await evidence(page, info, '127_attach');
});
