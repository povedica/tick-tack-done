import { expect, test } from '@playwright/test';
import { renderedContrast } from './contrast';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/auth/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/registration')) {
      await route.fulfill({ json: { open: false } });
      return;
    }
    if (url.includes('/password-reset/request')) {
      await route.fulfill({ status: 202, json: { status: 'accepted' } });
      return;
    }
    if (url.includes('/password-reset/verify')) {
      const body = route.request().postData() ?? '';
      if (body.includes('expired-token')) {
        await route.fulfill({
          status: 400,
          json: { error: { code: 'reset_token_invalid', message: 'invalid' } },
        });
        return;
      }
      await route.fulfill({
        json: {
          valid: true,
          totp_required: false,
          expires_at: '2026-01-01T00:30:00.000Z',
        },
      });
      return;
    }
    if (url.includes('/password-reset/confirm')) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (url.includes('/session')) {
      await route.fulfill({
        status: 401,
        json: { error: { code: 'unauthorized', message: 'no' } },
      });
      return;
    }
    await route.fallback();
  });
});

test('RF-PR-01 CA-1 CA-12: login link, request, sent, new password, success and expired', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(page.getByRole('link', { name: '¿Has olvidado tu contraseña?' })).toBeVisible();
  await page.getByRole('link', { name: '¿Has olvidado tu contraseña?' }).click();
  await page.getByLabel('Correo').fill('ada@example.test');
  await page.getByRole('button', { name: 'Enviar enlace' }).click();
  await expect(page.getByText(/Si existe una cuenta con ada@example.test/)).toBeVisible();
  await page.goto(`/reset-password#token=${'a'.repeat(43)}`);
  await expect(page.getByRole('heading', { name: 'Nueva contraseña' })).toBeVisible();
  expect(page.url()).not.toContain('#token=');
  await page.getByLabel('Nueva contraseña', { exact: true }).fill('correct-horse');
  await page.getByLabel('Repite la contraseña').fill('correct-horse');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByRole('heading', { name: 'Contraseña cambiada' })).toBeVisible();
  await page.goto('/login');
  await page.goto(`/reset-password#token=${'expired-token'.padEnd(43, 'x')}`);
  await expect(page.getByRole('heading', { name: 'Este enlace ya no sirve' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(true);
  const heading = page.getByRole('heading', { name: 'Este enlace ya no sirve' });
  await expect.poll(() => heading.evaluate(renderedContrast)).toBeGreaterThanOrEqual(4.5);
});
