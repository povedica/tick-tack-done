import { expect, test } from '@playwright/test';

test('TTD-AUD-34: login loads without unexpected browser errors', async ({ page }) => {
  const errors: string[] = [];
  const protectedRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    const expectedSessionProbe =
      message.location().url.endsWith('/api/v1/auth/session') &&
      message.text().includes('401 (Unauthorized)');
    if (message.type() === 'error' && !expectedSessionProbe)
      errors.push(message.text());
  });
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/registration') return route.fulfill({ json: { open: false } });
    if (!path.startsWith('/api/v1/auth/')) protectedRequests.push(path);
    return route.fulfill({ status: 401, json: {} });
  });
  await page.goto('/login');
  await expect(page.locator('.auth-card button[type="submit"]')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
  expect(protectedRequests).toEqual([]);
});

for (const accent of ['violet', 'teal']) {
  test(`TTD-AUD-26: login uses the chosen accent (${accent})`, async ({ page }) => {
    await page.addInitScript(
      (accent) => localStorage.setItem('tick-tack-done.accent', accent),
      accent,
    );
    await page.route('**/api/v1/**', (route) => route.fulfill({ status: 401, json: {} }));
    await page.goto('/login');
    const button = page.locator('.auth-card button[type="submit"]');
    await expect(button).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-accent', accent);
    const colors = await button.evaluate((node) => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'var(--accent)';
      document.body.append(probe);
      const expected = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { actual: getComputedStyle(node).backgroundColor, expected };
    });
    expect(colors.actual).toBe(colors.expected);
  });
}
