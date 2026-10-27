import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { r80Fixture } from './r80.fixture';

async function clickGoogleAction(page: Page, name: string) {
  const row = page.getByRole('article', { name: 'Google', exact: true });
  const direct = row.getByRole('button', { name, exact: true });
  if ((await direct.count()) > 0 && (await direct.first().isVisible())) {
    await direct.first().click();
    return;
  }
  await row.getByRole('button', { name: 'Más acciones', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
}
test('TTD-AUD-97: one Google card shows granted permission and local activation separately; disconnect affects both', async ({
  page,
}, info) => {
  await r80Fixture(page, { drive: true });
  let revoked = false;
  let driveEnabled = true;
  let removals = 0;
  await page.route('**/api/v1/integrations/google', async (route) => {
    if (route.request().method() === 'DELETE') {
      revoked = true;
      removals++;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({
      json: {
        configured: true,
        has_connection: !revoked,
        authorized: !revoked,
        enabled: true,
        connected: !revoked,
        status: revoked ? 'disconnected' : 'connected',
        account: 'synthetic@example.test',
      },
    });
  });
  await page.route('**/api/v1/integrations/drive', (route) =>
    route.fulfill({
      json: {
        configured: true,
        authorized: !revoked,
        enabled: driveEnabled,
        connected: !revoked && driveEnabled,
        status: revoked ? 'disconnected' : driveEnabled ? 'connected' : 'disabled',
        account: 'synthetic@example.test',
      },
    }),
  );
  await page.route('**/api/v1/integrations/google/services/drive', (route) => {
    driveEnabled = route.request().postDataJSON().enabled;
    return route.fulfill({
      json: {
        authorized: true,
        enabled: driveEnabled,
        status: driveEnabled ? 'connected' : 'disabled',
      },
    });
  });
  await page.goto('/settings/integrations');
  const calendar = page.getByRole('group', { name: 'Google Calendar', exact: true });
  const drive = page.getByRole('group', { name: 'Google Drive', exact: true });
  const calendarSwitch = calendar.getByRole('switch', { name: /Google Calendar/ });
  const driveSwitch = drive.getByRole('switch', { name: /Google Drive/ });
  await expect(page.getByRole('heading', { name: 'Google', exact: true })).toHaveCount(1);
  await expect(calendarSwitch).toBeChecked();
  await expect(driveSwitch).toBeChecked();
  await drive.getByRole('button', { name: /Tratamiento de datos/ }).click();
  await expect(page.getByRole('dialog')).toContainText('sin guardar los ficheros en su servidor');
  await page.keyboard.press('Escape');
  await driveSwitch.click();
  await expect(driveSwitch).not.toBeChecked();
  await expect(calendarSwitch).toBeChecked();
  expect(removals).toBe(0);
  await driveSwitch.click();
  await expect(driveSwitch).toBeChecked();
  const theme = info.project.name.endsWith('dark') ? 'dark' : 'light';
  await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
  const phase = process.env.R80_PHASE ?? 'antes';
  const capture = (name: string) =>
    page.screenshot({
      path: path.resolve(
        '../../test-artifacts/audit/evidencias/r80',
        `97_${name}_${phase}_${info.project.name.replace('-', '_')}.png`,
      ),
      animations: 'disabled',
    });
  await capture('google');
  await clickGoogleAction(page, 'Desconectar Google');
  const dialog = page.getByRole('alertdialog', { name: 'Desconectar' });
  await expect(dialog).toContainText('Los calendarios dejan de sincronizarse');
  await expect(dialog).toContainText('Los adjuntos siguen en tu Drive como enlaces');
  await expect(dialog).toContainText('Se revoca el acceso también en Google');
  await capture('confirmacion');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(removals).toBe(0);
  await clickGoogleAction(page, 'Desconectar Google');
  await dialog.getByRole('button', { name: 'Desconectar', exact: true }).click();
  await expect(calendar).toContainText('Desconectado');
  await expect(drive).toContainText('Desconectado');
  expect(removals).toBe(1);
  await page.goto('/today?task=task');
  await expect(page.locator('.attachment-chip')).toHaveAttribute(
    'href',
    'https://drive.google.com/file/d/synthetic/view',
  );
  await expect(page.locator('.detail-attach-btn')).toBeDisabled();
  await page
    .getByRole('complementary', { name: 'Tarea', exact: true })
    .getByRole('button', { name: 'Más acciones', exact: true })
    .click();
  await expect(page.getByRole('menuitem', { name: /Adjuntar/ })).toBeDisabled();
  await expect(
    page.getByText('Para adjuntar ficheros, Google Drive debe estar activo.', { exact: true }),
  ).toBeVisible();
});
test('TTD-AUD-97: a missing Drive permission offers incremental authorization through the shared Google client', async ({
  page,
}) => {
  await r80Fixture(page, { drive: true });
  let requested = '';
  await page.route('**/api/v1/integrations/drive', (route) =>
    route.fulfill({
      json: {
        configured: true,
        authorized: false,
        enabled: true,
        connected: false,
        status: 'permission_required',
        account: 'synthetic@example.test',
      },
    }),
  );
  await page.route('**/api/v1/integrations/google/start?**', (route) => {
    requested = new URL(route.request().url()).searchParams.get('service') ?? '';
    return route.fulfill({
      json: {
        url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=shared&scope=drive.file',
      },
    });
  });
  await page.route('https://accounts.google.com/**', (route) =>
    route.fulfill({ body: 'Synthetic Google consent', contentType: 'text/html' }),
  );
  await page.goto('/settings/integrations');
  const drive = page.getByRole('group', { name: 'Google Drive', exact: true });
  await expect(drive).toContainText('Sin permiso');
  await expect(
    page.getByRole('group', { name: 'Google Calendar', exact: true }).getByRole('switch'),
  ).toBeChecked();
  await drive.getByRole('button', { name: 'Autorizar Google Drive', exact: true }).click();
  await expect.poll(() => requested).toBe('drive');
  await expect(page).toHaveURL(/^https:\/\/accounts\.google\.com\//);
});

for (const [status, label, button] of [
  ['permissions_unknown', 'Permisos por comprobar', 'Autorizar Google Drive'],
  ['reauth_required', 'Autorización caducada o revocada', 'Reconectar Google Drive'],
] as const)
  test(`TTD-AUD-97: ${status} is distinct from connected`, async ({ page }) => {
    await r80Fixture(page, { drive: true });
    await page.route('**/api/v1/integrations/drive', (route) =>
      route.fulfill({
        json: { configured: true, authorized: false, enabled: true, connected: false, status },
      }),
    );
    await page.goto('/settings/integrations');
    const drive = page.getByRole('group', { name: 'Google Drive', exact: true });
    await expect(drive).toContainText(label);
    await expect(drive.getByRole('button', { name: button, exact: true })).toBeVisible();
    await expect(drive.getByRole('switch', { name: 'Google Drive', exact: true })).toHaveCount(0);
  });
test('TTD-AUD-97: changing permissions confirms shared revocation before new Google consent', async ({
  page,
}) => {
  await r80Fixture(page, { drive: true });
  const steps: string[] = [];
  await page.route('**/api/v1/integrations/google', (route) => {
    if (route.request().method() === 'DELETE') {
      steps.push('revoke');
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({
      json: {
        configured: true,
        has_connection: true,
        authorized: true,
        enabled: true,
        connected: true,
        status: 'connected',
      },
    });
  });
  await page.route('**/api/v1/integrations/google/start?**', (route) => {
    steps.push(`authorize:${new URL(route.request().url()).searchParams.get('service')}`);
    return route.fulfill({
      json: { url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=shared' },
    });
  });
  await page.route('https://accounts.google.com/**', (route) =>
    route.fulfill({ body: 'Synthetic consent', contentType: 'text/html' }),
  );
  await page.goto('/settings/integrations');
  await clickGoogleAction(page, 'Cambiar permisos');
  const dialog = page.getByRole('alertdialog', { name: 'Cambiar permisos' });
  await expect(dialog).toContainText('Ambos servicios se interrumpen');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(steps).toEqual([]);
  await clickGoogleAction(page, 'Cambiar permisos');
  await dialog.getByRole('button', { name: 'Revocar y elegir permisos', exact: true }).click();
  await expect(page).toHaveURL(/^https:\/\/accounts\.google\.com\//);
  expect(steps).toEqual(['revoke', 'authorize:all']);
});
