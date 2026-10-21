import { expect, test } from '@playwright/test';

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
