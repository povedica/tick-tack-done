import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';

for (const width of [390, 1280])
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`${width} ${colorScheme}`, () => {
      test.use({ viewport: { width, height: 844 }, colorScheme });
      test('RF-302: groups start expanded and folders contain lists', async ({ page }) => {
        await r80Fixture(page);
        await page.route('**/api/v1/folders', (route) =>
          route.fulfill({
            json: { items: [{ id: 'folder', name: 'Vida', sort_order: '1' }], next_cursor: null },
          }),
        );
        await page.route(
          (url) => url.pathname === '/api/v1/projects',
          (route) =>
            route.fulfill({
              json: {
                items: [
                  {
                    id: 'personal',
                    name: 'Personal',
                    folder_id: 'folder',
                    is_inbox: false,
                    closed: false,
                    kind: 'task',
                    color: '#4772fa',
                    sort_order: '1',
                    active_task_count: 0,
                  },
                ],
                next_cursor: null,
              },
            }),
        );
        await page.goto('/today');
        if (width < 640)
          await page
            .locator('.bottom-bar')
            .getByRole('button', { name: 'Listas', exact: true })
            .click();
        const sidebar = page.locator('.sidebar');
        for (const name of ['Filtros', 'Listas', 'Etiquetas'])
          await expect(sidebar.getByRole('button', { name, exact: true })).toHaveAttribute(
            'aria-expanded',
            'true',
          );
        const folder = sidebar.locator('.nav-folder').filter({ hasText: 'Vida' });
        await expect(folder.locator('summary .lucide-folder')).toBeVisible();
        await expect(folder.getByRole('link', { name: 'Personal', exact: true })).toBeVisible();
        await folder.locator('summary').click();
        await expect(folder.getByRole('link', { name: 'Personal', exact: true })).toBeHidden();
        await folder.locator('summary').click();
        await expect(folder.getByRole('link', { name: 'Personal', exact: true })).toBeVisible();
        await sidebar.getByRole('button', { name: 'Filtros', exact: true }).click();
        await page.reload();
        if (width < 640)
          await page
            .locator('.bottom-bar')
            .getByRole('button', { name: 'Listas', exact: true })
            .click();
        await expect(sidebar.getByRole('button', { name: 'Filtros', exact: true })).toHaveAttribute(
          'aria-expanded',
          'false',
        );
      });
    });
  }
