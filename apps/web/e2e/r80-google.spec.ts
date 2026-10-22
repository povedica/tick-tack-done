import path from 'node:path';
import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';

test('TTD-AUD-97: one Google card explains both permissions and all disconnect effects', async ({
  page,
}, info) => {
  await r80Fixture(page, { drive: true });
  let connected = true;
  const removals: string[] = [];
  await page.route('**/api/v1/integrations/google', async (route) => {
    if (route.request().method() === 'DELETE') {
      removals.push(route.request().url());
      connected = false;
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      json: {
        configured: true,
        connected,
        account: connected ? 'synthetic@example.test' : null,
        status: connected ? 'connected' : 'disconnected',
      },
    });
  });
  await page.goto('/settings/integrations');
  const card = page.locator('section[aria-labelledby=google-title]');
  await expect(card).toBeVisible();
  await page.evaluate(
    (theme) => (document.documentElement.dataset.theme = theme),
    info.project.name.endsWith('dark') ? 'dark' : 'light',
  );
  const phase = process.env.R80_PHASE ?? 'antes';
  const capture = async (name: string) =>
    page.screenshot({
      path: path.resolve(
        '../../docs/audit/evidencias/r80',
        `97_${name}_${phase}_${info.project.name.replace('-', '_')}.png`,
      ),
      animations: 'disabled',
    });
  await capture('google');
  await card.getByRole('button', { name: 'Desconectar', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Desconectar' });
  await expect(dialog).toBeVisible();
  await capture('confirmacion');
  await expect(page.locator('#google-title')).toHaveText('Google (Calendar y Drive)');
  await expect(page.locator('#drive-title')).toHaveCount(0);
  await expect(card).toContainText('Calendario: lectura/escritura');
  await expect(card).toContainText('Drive: solo ficheros creados por ttd');
  await expect(dialog).toContainText('dejan de sincronizarse');
  await expect(dialog).toContainText('siguen en tu Drive como enlaces');
  await expect(dialog).toContainText('también en Google');
  const remove = dialog.getByRole('checkbox', {
    name: 'Borrar también los eventos importados',
    exact: true,
  });
  await expect(remove).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(removals).toHaveLength(0);
  await card.getByRole('button', { name: 'Desconectar', exact: true }).click();
  await dialog.getByRole('button', { name: 'Desconectar', exact: true }).click();
  await expect(page.getByText('Google desconectado.', { exact: false })).toBeVisible();
  expect(removals).toHaveLength(1);
  expect(removals[0]).not.toContain('remove_imported_events=true');
  await page.goto('/today?task=task');
  await expect(page.locator('.attachment-chip')).toHaveAttribute(
    'href',
    'https://drive.google.com/file/d/synthetic/view',
  );
  await expect(page.locator('.detail-attach-btn')).toBeDisabled();
});
