import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';
test('TTD-AUD-104: versions, mismatch and sanitized copied diagnostic', async ({
  page,
  context,
}) => {
  await r80Fixture(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/api/v1/health', (route) =>
    route.fulfill({
      json: {
        status: 'ok',
        commit: 'acd7570',
        version: '0.2.0',
        built_at: '2026-10-22T10:00:00Z',
        mcp_version: '0.2.0+acd7570',
        email: 'private@example.test',
        token: 'Bearer secret',
      },
    }),
  );
  await page.goto('/settings/about');
  await expect(page.getByRole('heading', { name: 'Acerca de', exact: true })).toBeVisible();
  await expect(page.locator('dd').nth(1)).toContainText('acd7570');
  await expect(page.locator('dd').nth(2)).toHaveText('0.2.0+acd7570');
  await page.getByRole('button', { name: 'Copiar diagnóstico' }).click();
  const diagnostic = await page.evaluate(() => navigator.clipboard.readText());
  expect(diagnostic).toContain('API: acd7570 / 0.2.0');
  expect(diagnostic).not.toMatch(/@|Bearer|private|secret/i);
  await expect(page.getByRole('link', { name: 'Repositorio', exact: true })).toHaveAttribute(
    'href',
    'https://github.com/povedica/tick-tack-done',
  );
});
