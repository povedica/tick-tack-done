import { expect, test, type Page } from '@playwright/test';
import { replySession } from './mock-session';

test('TTD-AUD-59: Today view is restored in a second device context', async ({ browser }) => {
  let preferences: Record<string, unknown> | null = null;
  async function fixture(page: Page) {
    await page.route('**/api/v1/**', async (route) => {
      if (await replySession(route)) return;
      const path = new URL(route.request().url()).pathname;
      let body: unknown = { items: [], next_cursor: null };
      if (path.endsWith('/view-preferences/today')) {
        if (route.request().method() === 'PUT')
          preferences = route.request().postDataJSON() as Record<string, unknown>;
        body = { preferences };
      }
      await route.fulfill({ status: 200, json: body });
    });
  }
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const one = await first.newPage();
    await fixture(one);
    await one.goto('/today');
    await one
      .locator('.task-view-toggle')
      .getByRole('button', { name: 'Kanban', exact: true })
      .click();
    await expect.poll(() => preferences?.view).toBe('kanban');
    const two = await second.newPage();
    await fixture(two);
    await two.goto('/today');
    await expect(
      two.locator('.task-view-toggle').getByRole('button', { name: 'Kanban', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      await two.evaluate(() => localStorage.getItem('tick-tack-done.matrix.view.today')),
    ).not.toBeNull();
  } finally {
    await first.close();
    await second.close();
  }
});
