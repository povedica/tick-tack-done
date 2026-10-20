import { expect, test } from '@playwright/test';

test.skip(
  process.env.TICKY_CROSS_BROWSER_WS === undefined,
  'Requires isolated real NestJS and Python services',
);
for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`APP-06 / TK-610: real deterministic chat at ${String(viewport.width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/ticky');
    const input = page.locator('#ticky-input');
    await expect(input).toBeVisible();
    await input.fill('Qué tengo hoy');
    await input.press('Tab');
    await page.locator('.ticky-composer button[type=submit]').click();
    await expect(page.locator('.ticky-log')).toContainText('Synthetic HTTP task', {
      timeout: 20_000,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/ticky-cross-${String(viewport.width)}.png`,
      fullPage: true,
    });
  });
}
