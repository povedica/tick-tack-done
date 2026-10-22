import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`TTD-AUD-79: connected apps, expiry and client instructions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    let connected = true;
    let created: Record<string, unknown> | null = null;
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
      let body: unknown = { items: [], next_cursor: null, total: 0 };
      if (path === '/me' || path === '/auth/session')
        body = {
          id: 'user',
          email: 'test@example.test',
          display_name: 'Test',
          csrf_token: 'test',
          time_zone: 'Europe/Madrid',
          locale: 'es',
          features: {},
        };
      if (path === '/me/oauth/grants')
        body = {
          items: connected
            ? [
                {
                  client_id: 'client',
                  client_name: 'Claude',
                  authorized_at: '2026-10-21T12:00:00Z',
                  last_used_at: null,
                  active_access_tokens: 1,
                  active_refresh_families: 1,
                  renewals: 12,
                  scopes: ['tasks:read'],
                },
              ]
            : [],
        };
      if (path === '/me/oauth/grants/client/revoke') {
        connected = false;
        await route.fulfill({ status: 204 });
        return;
      }
      if (path === '/me/tokens' && route.request().method() === 'POST') {
        created = route.request().postDataJSON() as Record<string, unknown>;
        body = {
          id: 'new',
          name: created.name,
          scopes: created.scopes,
          token: 'rfx_pat_fixture',
          token_prefix: 'rfx_pat_',
          created_at: '2026-10-22T00:00:00Z',
          last_used_at: null,
          revoked_at: null,
          oauth_client_id: null,
          expires_at: '2026-11-21T00:00:00Z',
          client_name: null,
        };
      }
      await route.fulfill({ status: route.request().method() === 'POST' ? 201 : 200, json: body });
    });
    await page.goto('/settings/tokens');
    await expect(page.getByRole('heading', { name: 'Aplicaciones conectadas' })).toBeVisible();
    await page.getByRole('tab', { name: 'Claude', exact: true }).click();
    await expect(page.getByText('Inicia sesión en ttd cuando te lo pida')).toBeVisible();
    await expect(page.locator('.token-snippet')).toHaveCount(0);
    await page.screenshot({ path: `/tmp/ttd-tokens-${width}-connected-light.png`, fullPage: true });
    await page.getByRole('button', { name: 'Revocar acceso', exact: true }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Revocar acceso', exact: true })
      .click();
    await expect(page.getByText('Ninguna aplicación conectada todavía')).toBeVisible();
    await page.screenshot({ path: `/tmp/ttd-tokens-${width}-light.png`, fullPage: true });
    await page.getByRole('button', { name: 'Nuevo token', exact: true }).click();
    await page.locator('#token-name').fill('Audit token');
    await page.getByRole('radio', { name: '30 días', exact: true }).check();
    if (width < 1024) await page.locator('.token-resource summary').first().click();
    await page.getByRole('button', { name: 'Leer', exact: true }).first().click();
    await page.getByRole('button', { name: 'Crear token', exact: true }).click();
    await expect(page.locator('.token-secret-value')).toHaveValue('rfx_pat_fixture');
    expect(created).toMatchObject({ expires_in_days: 30 });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.screenshot({ path: `/tmp/ttd-tokens-${width}-dark.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
