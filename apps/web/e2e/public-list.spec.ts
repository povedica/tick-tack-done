import { expect, test, type Page } from '@playwright/test';

const list = {
  name: 'Semilla',
  generated_at: '2026-10-30T00:00:00.000Z',
  tasks: [
    {
      ref: 't1',
      title: 'Comprar pan',
      notes: 'Pan del horno',
      status: 'active',
      priority: 'none',
      start_date: null,
      due_date: '2026-10-30T09:00:00.000Z',
      all_day: false,
      tags: [{ name: 'casa', color: null }],
      checklist: [{ title: 'pagar', done: false }],
      subtasks: [],
    },
  ],
};

async function openShared(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((choice) => {
    localStorage.setItem('tick-tack-done.theme', choice);
  }, theme);
  await page.emulateMedia({ colorScheme: theme === 'dark' ? 'dark' : 'light' });
  await page.route('**/api/v1/public/lists/**', async (route) => {
    await route.fulfill({ json: list });
  });
  await page.route('**/api/v1/auth/session', async (route) => {
    await route.fulfill({
      status: 401,
      json: { error: { code: 'unauthorized', message: 'no' } },
    });
  });
  await page.goto('/s/seed-token');
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    test(`COMP-29 shared list ${theme} ${viewport.width}x${viewport.height} without a session`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openShared(page, theme);
      await expect(page.getByRole('note')).toContainText('Lista compartida en solo lectura');
      await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
      await expect(page.locator('.sidebar')).toHaveCount(0);
      await expect(page.locator('.bottom-bar')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Semilla' })).toBeVisible();
      await expect(page.getByText('Comprar pan')).toBeVisible();
    });
  }
}
