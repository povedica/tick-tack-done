import { expect, test, type Page } from '@playwright/test';
import { renderedContrast } from './contrast';

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ] as const) {
    test.describe(`${theme} ${String(viewport.width)}`, () => {
      test.use({ viewport, colorScheme: theme });
      test('creates, pins, duplicates and restores a filter', async ({ page }) => {
        test.setTimeout(60_000);
        await boot(page);
        await page.goto('/filters');
        await expect(page.getByRole('heading', { name: 'Filtros' })).toBeVisible();
        await page.screenshot({
          path: `e2e/__screenshots__/filters-list-${theme}-${String(viewport.width)}.png`,
          fullPage: true,
        });
        await page.locator('#content').getByRole('button', { name: 'Nuevo filtro' }).click();
        const dialog = page.getByRole('dialog', { name: 'Nuevo filtro' });
        await dialog.getByLabel('Nombre').fill('Casa · hoy');
        await dialog.getByLabel('Campo').selectOption('tag');
        await dialog.getByRole('button', { name: 'Añadir etiqueta…' }).click();
        await page.getByRole('checkbox', { name: 'casa' }).check();
        await page.keyboard.press('Escape');
        await dialog.getByRole('button', { name: 'Añadir condición' }).click();
        const fields = dialog.getByLabel('Campo');
        await fields.nth(1).selectOption('date');
        await page.screenshot({
          path: `e2e/__screenshots__/filters-editor-${theme}-${String(viewport.width)}.png`,
          fullPage: true,
        });
        await dialog.getByRole('button', { name: 'Guardar filtro' }).first().click();
        await expect(page).toHaveURL(/\/filter\//);
        await expect(page.getByRole('heading', { name: 'Casa · hoy' })).toBeVisible();
        await page.screenshot({
          path: `e2e/__screenshots__/filters-view-${theme}-${String(viewport.width)}.png`,
          fullPage: true,
        });
        if (viewport.width < 1024) {
          const box = await page
            .getByRole('button', { name: 'Acciones', exact: true })
            .boundingBox();
          expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
          expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        }
        await page.getByRole('button', { name: 'Acciones', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Fijar arriba' }).click();
        await page.goto('/filter/no-existe');
        await expect(page.getByRole('link', { name: 'Ver filtros' })).toBeVisible();
        const contrast = await page.locator('h1').evaluate(renderedContrast);
        expect(contrast).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
}

async function boot(page: Page): Promise<void> {
  const filters: Array<Record<string, unknown>> = [];
  await page.addInitScript(() => {
    localStorage.setItem('tick-tack-done.locale', 'es');
    localStorage.setItem('tick-tack-done.account-prefs', '1');
  });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    const method = route.request().method();
    let body: unknown = { items: [], next_cursor: null };
    if (path === '/auth/session' || path === '/me') {
      body = {
        id: 'user',
        display_name: 'Prueba',
        email: 'test@example.test',
        csrf_token: 'test',
        locale: 'es',
        time_zone: 'Europe/Madrid',
        features: {},
      };
    }
    if (path === '/tags' && method === 'GET') {
      body = {
        items: [{ id: 'tag-casa', name: 'casa', color: '#1F9D55' }],
        next_cursor: null,
      };
    }
    if (path === '/projects' && method === 'GET') {
      body = {
        items: [
          {
            id: 'inbox',
            name: 'Bandeja',
            is_inbox: true,
            closed: false,
            color: null,
            kind: 'TASK',
            task_count: 0,
            completed_count: 0,
            open_count: 0,
          },
        ],
        next_cursor: null,
      };
    }
    if (path === '/filters' && method === 'GET') {
      body = { items: filters, next_cursor: null };
    }
    if (path === '/filters' && method === 'POST') {
      const data = route.request().postDataJSON() as Record<string, unknown>;
      const created = {
        id: 'filter-casa',
        name: data.name,
        color: data.color ?? null,
        icon: null,
        pinned: false,
        mode: data.mode,
        rules: data.rules,
        task_count: 1,
        tag_labels: { 'tag-casa': { name: 'casa', color: '#1F9D55', deleted: false } },
      };
      filters.push(created);
      body = created;
    }
    if (path === '/filters/preview' && method === 'POST') {
      body = {
        count: 1,
        group_by: 'section',
        sort: 'manual',
        groups: [
          {
            id: 'g',
            name: 'Alta prioridad',
            tasks: [
              {
                id: 'task-1',
                title: 'Regar',
                priority: 'high',
                status: 'active',
                project_id: 'inbox',
                kind: 'task',
              },
            ],
          },
        ],
      };
    }
    if (path.startsWith('/filters/') && method === 'PATCH') {
      const current = filters[0];
      if (current !== undefined) {
        current.pinned = true;
        body = current;
      }
    }
    if (path.startsWith('/filters/') && path.endsWith('/tasks')) {
      body = {
        count: 1,
        group_by: 'section',
        sort: 'manual',
        groups: [],
      };
    }
    await route.fulfill({
      status: method === 'DELETE' ? 204 : 200,
      contentType: 'application/json',
      body: method === 'DELETE' ? '' : JSON.stringify(body),
    });
  });
}
