import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';

for (const width of [360, 390, 1280]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`${width} ${colorScheme}`, () => {
      test.use({ viewport: { width, height: 640 }, colorScheme });
      for (const route of ['/smart/tomorrow', '/list/list', '/today']) {
        test(`RF-1001/1002/1004: view menu fits an empty list ${route}`, async ({ page }) => {
          await r80Fixture(page);
          await page.route('**/api/v1/filters/preview', (request) =>
            request.fulfill({ json: { groups: [], count: 0, next_cursor: null } }),
          );
          await page.goto(route);
          const header = page.locator('.today-header');
          const toggle = header.locator('.task-view-toggle');
          if (width < 701) {
            await expect(toggle).toBeHidden();
            const title = header.locator('h1');
            expect(await title.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
          } else await expect(toggle).toBeVisible();
          await header.getByRole('button', { name: 'Acciones', exact: true }).click();
          const menu = page.locator('.view-menu-popover');
          await expect(
            menu.getByRole('menuitemradio', { name: 'Kanban', exact: true }),
          ).toBeVisible();
          const print = menu.getByRole('menuitem', { name: 'Imprimir', exact: true });
          await expect(print).toBeInViewport();
          expect(
            await print.evaluate((node) => {
              const rect = node.getBoundingClientRect();
              return node.contains(
                document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
              );
            }),
          ).toBe(true);
          await menu.getByRole('menuitem', { name: 'Opciones de vista', exact: true }).click();
          await print.scrollIntoViewIfNeeded();
          await expect(print).toBeInViewport();
          const box = await menu.boundingBox();
          expect(box!.y + box!.height).toBeLessThanOrEqual(640);
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(width);
          await page.keyboard.press('Escape');
          await expect(menu).toBeHidden();
          await expect(header.getByRole('button', { name: 'Acciones', exact: true })).toBeFocused();
          await header.getByRole('button', { name: 'Acciones', exact: true }).click();
          await menu.getByRole('menuitemradio', { name: 'Matriz', exact: true }).click();
          await expect(menu).toBeHidden();
          await header.getByRole('button', { name: 'Acciones', exact: true }).click();
          await expect(
            menu.getByRole('menuitemradio', { name: 'Matriz', exact: true }),
          ).toHaveAttribute('aria-checked', 'true');
          await menu.getByRole('menuitemradio', { name: 'Kanban', exact: true }).click();
          await expect(page).toHaveURL(/view=kanban/);
          await expect(menu).toBeHidden();
        });
      }
    });
  }
}
