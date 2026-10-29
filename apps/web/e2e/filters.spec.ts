import { expect, test, type Locator, type Page } from '@playwright/test';
import { renderedContrast } from './contrast';

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ] as const) {
    test.describe(`${theme} ${String(viewport.width)}`, () => {
      test.use({ viewport, colorScheme: theme });
      test('creates, pins, duplicates and restores a filter', async ({ page }) => {
        test.setTimeout(90_000);
        const phone = viewport.width < 768;
        const narrow = viewport.width < 1024;
        await boot(page);
        await page.goto('/filters');
        await expect(page.getByRole('heading', { name: 'Filtros' })).toBeVisible();
        await expectContrast(page.locator('h1'));
        if (phone) {
          const create = page.locator('#content').getByRole('button', { name: 'Nuevo filtro' });
          await expectTap(create);
          await expect(create.getByText('Nuevo filtro')).toBeHidden();
        }
        await page.screenshot({
          path: `e2e/__screenshots__/filters-list-${theme}-${String(viewport.width)}.png`,
          fullPage: true,
        });
        await page.locator('#content').getByRole('button', { name: 'Nuevo filtro' }).click();
        const dialog = page.getByRole('dialog', { name: 'Nuevo filtro' });
        await dialog.getByLabel('Nombre').fill('Casa · hoy');
        await dialog.getByRole('radio', { name: 'Verde' }).click();
        await dialog.getByRole('button', { name: 'Campo: Palabra' }).click();
        await page.getByRole('option', { name: 'Etiqueta' }).click();
        await dialog.getByRole('button', { name: 'Añadir etiqueta…' }).click();
        await page.getByRole('checkbox', { name: 'casa' }).check();
        await page.keyboard.press('Escape');
        await dialog.getByRole('button', { name: 'Añadir condición' }).click();
        await page.getByRole('option', { name: 'Fecha' }).click();
        if (narrow) {
          const bar = dialog.locator('.filter-editor-bar');
          await expect(bar).toContainText('1 tarea coincide');
          await expect(bar.getByRole('button', { name: 'Ver' })).toBeVisible();
          const barBox = await bar.boundingBox();
          const seeBox = await bar.getByRole('button', { name: 'Ver' }).boundingBox();
          expect(barBox?.width ?? 0).toBeGreaterThan(200);
          expect((seeBox?.y ?? 0) - (barBox?.y ?? 0)).toBeLessThan(20);
          const body = dialog.locator('.filter-editor-body');
          const fit = await body.evaluate((node) => node.scrollWidth <= node.clientWidth + 1);
          expect(fit).toBe(true);
          await expect(dialog.locator('.filter-editor-actions')).toBeHidden();
        } else {
          await expect(dialog.locator('.filter-preview strong')).toHaveText('1 tarea coincide');
        }
        if (phone) {
          await expectTap(dialog.getByRole('radio', { name: 'Verde' }));
          await expectTap(dialog.getByRole('button', { name: 'Quitar condición Fecha' }));
        }
        await expectContrast(dialog.locator('.filter-editor-head h2'));
        await page.screenshot({
          path: `e2e/__screenshots__/filters-editor-${theme}-${String(viewport.width)}.png`,
          fullPage: true,
        });
        await dialog.getByRole('button', { name: 'Guardar filtro' }).first().click();
        await expect(page).toHaveURL(/\/filter\/filter-casa$/);
        await expect(page.getByRole('heading', { name: 'Casa · hoy' })).toBeVisible();
        await expect(page.getByText('casa', { exact: true }).first()).toBeVisible();
        await expect(page.getByText('Hoy', { exact: true }).first()).toBeVisible();
        await expectContrast(page.locator('h1'));
        await page.screenshot({
          path: `e2e/__screenshots__/filters-view-${theme}-${String(viewport.width)}.png`,
          fullPage: true,
        });
        const chip = page.locator('.filter-view-rules .filter-summary-chip').first();
        await expect(chip).toBeVisible();
        const border = await chip.evaluate((node) => getComputedStyle(node).borderTopWidth);
        expect(Number.parseFloat(border)).toBeGreaterThanOrEqual(1);
        await page.screenshot({
          path: `e2e/__screenshots__/filters-view-chips-${theme}-${String(viewport.width)}.png`,
        });
        await expect(
          page.locator('.filter-view-rules').getByRole('button', { name: 'Editar condiciones' }),
        ).toHaveCount(0);
        await page
          .locator('#content')
          .getByRole('button', { name: 'Acciones', exact: true })
          .click();
        await page.getByRole('menuitem', { name: 'Editar condiciones' }).click();
        const editor = page.getByRole('dialog', { name: 'Editar filtro' });
        await editor.getByRole('button', { name: 'Añadir condición' }).click();
        await page.getByRole('option', { name: 'Prioridad' }).click();
        await editor.getByRole('button', { name: 'Quitar condición Prioridad' }).click();
        await expect(
          editor.getByRole('button', { name: 'Quitar condición Prioridad' }),
        ).toHaveCount(0);
        await editor.getByRole('button', { name: 'Guardar filtro' }).first().click();
        await expect(editor).toBeHidden();
        if (phone) {
          await expectTap(
            page.locator('#content').getByRole('button', { name: 'Acciones', exact: true }),
          );
        }
        await page
          .locator('#content')
          .getByRole('button', { name: 'Acciones', exact: true })
          .click();
        if (phone) {
          await expectTap(page.getByRole('menuitem', { name: 'Fijar arriba' }));
        }
        await page.getByRole('menuitem', { name: 'Fijar arriba' }).click();
        await expect(page.locator('.filter-live')).toHaveText('Filtro fijado');
        await page.goto('/filters/filter-casa');
        await expect(page).toHaveURL(/\/filter\/filter-casa$/);
        if (narrow) {
          await listsButton(page).click();
        }
        const side = page.locator('.sidebar a[href="/filter/filter-casa"]');
        await expect(side).toHaveAttribute('aria-current', 'page');
        await expect(side).toHaveAttribute('style', /1F9D55/i);
        const sideRow = page.locator('.sidebar .nav-row', { hasText: 'Casa · hoy' });
        if (narrow) {
          const box = await sideRow.boundingBox();
          await sideRow.dispatchEvent('pointerdown', {
            pointerType: 'touch',
            clientX: (box?.x ?? 0) + 12,
            clientY: (box?.y ?? 0) + 12,
          });
          await page.waitForTimeout(600);
          await expect(page.getByRole('menuitem', { name: 'Duplicar' })).toBeVisible();
          await page.keyboard.press('Escape');
          await listsButton(page).click();
        } else {
          await sideRow.hover();
          await expect(
            page
              .locator('.sidebar')
              .getByRole('button', { name: 'Acciones de Casa · hoy', exact: true }),
          ).toBeVisible();
        }
        await page.goto('/filters');
        await expect(page.locator('.filter-pin')).toHaveAttribute('aria-label', 'Fijado');
        await expect(page.locator('.filter-row').first().locator('.filter-name')).toContainText(
          'Casa · hoy',
        );
        const casa = page.locator('.filter-row').first();
        await casa.getByRole('link').focus();
        await casa.getByRole('link').press('Shift+F10');
        await page.getByRole('menuitem', { name: 'Duplicar' }).click();
        await expect(page.locator('.filter-live')).toHaveText('Filtro duplicado');
        await expect(page.locator('.filter-name', { hasText: '(copia)' })).toBeVisible();
        await expect(page.locator('.filter-row').first().locator('.filter-name')).not.toContainText(
          '(copia)',
        );
        await deleteFilter(page, 'Casa · hoy (copia)', theme, viewport.width, true);
        await expect(page.locator('.filter-name', { hasText: '(copia)' })).toBeVisible();
        await deleteFilter(page, 'Casa · hoy (copia)', theme, viewport.width, false);
        await deleteFilter(page, 'Casa · hoy', theme, viewport.width, false);
        await expect(page.getByRole('heading', { name: 'Aún no tienes filtros' })).toBeVisible();
        await page.screenshot({
          path: `e2e/__screenshots__/filters-empty-${theme}-${String(viewport.width)}.png`,
          fullPage: true,
        });
        await page.goto('/filter/no-existe');
        await expect(page.getByRole('link', { name: 'Ver filtros' })).toBeVisible();
        await expectContrast(page.locator('h1'));
      });

      test('polishes the field picker, match and groups', async ({ page }) => {
        test.setTimeout(90_000);
        const narrow = viewport.width < 1024;
        await boot(page);
        await page.goto('/filters');
        await page.locator('#content').getByRole('button', { name: 'Nuevo filtro' }).click();
        const dialog = page.getByRole('dialog', { name: 'Nuevo filtro' });
        await expect(dialog.locator('select')).toHaveCount(0);
        await dialog.getByLabel('Valor de Palabra').fill('solo-alguna');
        const count = narrow
          ? dialog.locator('.filter-editor-bar')
          : dialog.locator('.filter-preview strong');
        await expect(count).toContainText('0 tareas');
        await dialog.getByRole('radio', { name: 'Alguna' }).click();
        await expect(count).toContainText('2 tareas');
        const colors = await dialog.getByRole('radio', { name: 'Alguna' }).evaluate((node) => {
          const off = node.parentElement?.querySelector<HTMLElement>('[aria-checked="false"]');
          return {
            on: getComputedStyle(node).backgroundColor,
            off: off === undefined || off === null ? '' : getComputedStyle(off).backgroundColor,
          };
        });
        expect(colors.on).not.toBe(colors.off);
        await expectContrast(dialog.getByRole('radio', { name: 'Alguna' }));
        await dialog.getByRole('button', { name: 'Campo: Palabra' }).click();
        await page.screenshot({
          path: `e2e/__screenshots__/filters-editor-fieldpicker-${theme}-${String(viewport.width)}.png`,
        });
        await page.getByRole('option', { name: 'Lista' }).click();
        await dialog.getByRole('button', { name: 'Añadir lista…' }).click();
        await expect(page.getByRole('heading', { name: 'Proyectos' })).toBeVisible();
        await page.getByRole('textbox', { name: 'Buscar', exact: true }).fill('per');
        await expect(page.getByRole('checkbox', { name: 'Personal' })).toBeVisible();
        await page.screenshot({
          path: `e2e/__screenshots__/filters-editor-listpicker-${theme}-${String(viewport.width)}.png`,
        });
        await page.keyboard.press('Escape');
        await dialog.getByRole('button', { name: 'Campo: Lista' }).click();
        await page.getByRole('option', { name: 'Fecha' }).click();
        await dialog.getByRole('radio', { name: 'Entre fechas' }).click();
        await dialog.getByRole('button', { name: 'Desde' }).click();
        await expect(page.getByRole('dialog', { name: 'Fecha' })).toBeVisible();
        await page.keyboard.press('Escape');
        await dialog.getByRole('button', { name: 'Campo: Fecha' }).click();
        await page.getByRole('option', { name: 'Prioridad' }).click();
        await expect(dialog.getByRole('radio', { name: 'Alta' })).toHaveAttribute(
          'aria-checked',
          'true',
        );
        await dialog.getByRole('button', { name: 'Modo avanzado: grupos Y/O' }).click();
        await dialog.getByRole('button', { name: 'Añadir grupo' }).click();
        const join = dialog.getByRole('radiogroup', { name: 'Combinar grupos' });
        await expect(join.getByRole('radio', { name: 'Y' })).toHaveAttribute(
          'aria-checked',
          'true',
        );
        await page.screenshot({
          path: `e2e/__screenshots__/filters-editor-advanced-${theme}-${String(viewport.width)}.png`,
        });
        if (narrow) {
          const fit = await dialog
            .locator('.filter-editor-body')
            .evaluate((node) => node.scrollWidth <= node.clientWidth + 1);
          expect(fit).toBe(true);
          await expect(dialog.locator('.filter-editor-actions')).toBeHidden();
          await expectTap(dialog.getByRole('button', { name: 'Campo: Prioridad' }));
        }
      });
    });
  }
}

function listsButton(page: Page): Locator {
  return page.locator('.bottom-bar').getByRole('button', { name: 'Listas', exact: true });
}

async function deleteFilter(
  page: Page,
  name: string,
  theme: string,
  width: number,
  undo: boolean,
): Promise<void> {
  await page
    .locator('#content')
    .getByRole('button', { name: `Acciones de ${name}`, exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Eliminar', exact: true }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByRole('heading', { name: `¿Eliminar «${name}»?` })).toBeVisible();
  if (undo) {
    await page.screenshot({
      path: `e2e/__screenshots__/filters-delete-${theme}-${String(width)}.png`,
      fullPage: true,
    });
  }
  await confirm.getByRole('button', { name: 'Eliminar', exact: true }).click();
  const undoButton = page.getByRole('button', { name: 'Deshacer' });
  await expect(undoButton).toBeVisible();
  if (undo) {
    await undoButton.click();
    return;
  }
  await expect(undoButton).toBeHidden({ timeout: 12_000 });
}

async function expectTap(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
}

async function expectContrast(locator: Locator): Promise<void> {
  expect(await locator.evaluate(renderedContrast)).toBeGreaterThanOrEqual(4.5);
}

async function boot(page: Page): Promise<void> {
  const filters: Array<Record<string, unknown>> = [];
  const trash = new Map<string, Record<string, unknown>>();
  await page.addInitScript(() => {
    localStorage.setItem('tick-tack-done.locale', 'es');
    localStorage.setItem('tick-tack-done.account-prefs', '1');
  });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    const method = route.request().method();
    const parts = path.split('/');
    let status = 200;
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
    if (path === '/folders' && method === 'GET') {
      body = {
        items: [{ id: 'folder-proyectos', name: 'Proyectos', sort_order: '1' }],
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
            folder_id: null,
            task_count: 0,
            completed_count: 0,
            open_count: 0,
          },
          {
            id: 'list-personal',
            name: 'Personal',
            is_inbox: false,
            closed: false,
            color: null,
            kind: 'TASK',
            folder_id: 'folder-proyectos',
            task_count: 0,
            completed_count: 0,
            open_count: 0,
          },
        ],
        next_cursor: null,
      };
    }
    if (path === '/filters' && method === 'GET') {
      body = { items: ordered(filters), next_cursor: null };
    }
    if (path === '/filters' && method === 'POST') {
      const data = route.request().postDataJSON() as Record<string, unknown>;
      const created = {
        id: filters.some((item) => item.id === 'filter-casa') ? 'filter-casa-copia' : 'filter-casa',
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
      const data = route.request().postDataJSON() as {
        rules?: { groups?: Array<{ combinator?: string; conditions?: unknown[] }> };
      };
      const group = data.rules?.groups?.[0];
      const marked = JSON.stringify(group?.conditions ?? '').includes('solo-alguna');
      const count = marked ? (group?.combinator === 'OR' ? 2 : 0) : 1;
      body = {
        count,
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
    const id = parts[2] ?? '';
    if (parts[1] === 'filters' && id.length > 0 && parts[3] === 'restore' && method === 'POST') {
      const restored = trash.get(id);
      if (restored !== undefined) {
        filters.push(restored);
        trash.delete(id);
        body = restored;
      }
    }
    if (parts[1] === 'filters' && id.length > 0 && parts[3] === undefined && method === 'PATCH') {
      const data = route.request().postDataJSON() as Record<string, unknown>;
      const current = filters.find((item) => item.id === id);
      if (current !== undefined) {
        if (typeof data.name === 'string') {
          current.name = data.name;
        }
        if ('color' in data) {
          current.color = data.color;
        }
        if (data.mode !== undefined) {
          current.mode = data.mode;
        }
        if (data.rules !== undefined) {
          current.rules = data.rules;
        }
        if (typeof data.pinned === 'boolean') {
          current.pinned = data.pinned;
        }
        body = current;
      }
    }
    if (parts[1] === 'filters' && id.length > 0 && parts[3] === undefined && method === 'DELETE') {
      const index = filters.findIndex((item) => item.id === id);
      const removed = index < 0 ? undefined : filters.splice(index, 1)[0];
      if (removed !== undefined) {
        trash.set(id, removed);
      }
      status = 204;
    }
    if (parts[1] === 'filters' && parts[3] === 'tasks') {
      body = {
        count: 1,
        next_cursor: null,
        group_by: 'section',
        sort: 'manual',
        groups: [
          {
            key: 'g',
            name: '',
            tasks: [
              {
                id: 'task-1',
                title: 'Regar',
                priority: 'high',
                status: 'active',
                kind: 'task',
                project_id: 'inbox',
                content: '',
                tag_ids: ['tag-casa'],
                checklist_progress: { completed: 0, total: 0 },
                due_date: null,
                time_zone: 'Europe/Madrid',
                is_all_day: true,
                repeat_rule: null,
                completed_at: null,
                created_at: '2026-10-01T08:00:00.000Z',
                source: 'manual',
              },
            ],
          },
        ],
      };
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: status === 204 ? '' : JSON.stringify(body),
    });
  });
}

function ordered(filters: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  return [...filters].sort((left, right) => {
    const pin = Number(right.pinned) - Number(left.pinned);
    if (pin !== 0) {
      return pin;
    }
    return String(left.name).localeCompare(String(right.name));
  });
}
