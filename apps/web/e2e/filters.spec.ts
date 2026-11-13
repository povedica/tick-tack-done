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
        await expect(page.getByRole('heading', { name: 'Filtros', exact: true })).toBeVisible();
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
        await expect(previewSwitch(dialog, narrow)).not.toBeChecked();
        await enablePreview(dialog, narrow);
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
        await expectContrast(page.locator('.filter-view-rules .ui-tag').first());
        await page.screenshot({
          path: `e2e/__screenshots__/filters-view-${theme}-${String(viewport.width)}.png`,
          fullPage: true,
        });
        const tag = page.locator('.filter-view-rules .ui-tag').first();
        await expect(tag).toHaveText('casa');
        const tagStyle = await tag.evaluate((node) => {
          const computed = getComputedStyle(node);
          return { border: computed.borderTopWidth, background: computed.backgroundColor };
        });
        expect(Number.parseFloat(tagStyle.border)).toBe(0);
        expect(tagStyle.background).not.toBe('rgba(0, 0, 0, 0)');
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
        await expect(page.getByRole('menuitem', { name: 'Editar condiciones' })).toHaveCount(0);
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
        await expect(
          page.locator('#content').getByRole('button', { name: 'Nuevo filtro' }),
        ).toBeFocused();
        await page.screenshot({
          path: `e2e/__screenshots__/filters-empty-${theme}-${String(viewport.width)}.png`,
          fullPage: true,
        });
        await page.goto('/filter/no-existe');
        await expect(page.getByRole('link', { name: 'Ver filtros' })).toBeVisible();
        await expectContrast(page.locator('h1'));
      });

      test('CA-101-2/3 RF-903: layout and keyboard menus on every filter surface', async ({
        page,
      }) => {
        await boot(page, 24);
        await page.goto('/filters');
        await expect(page.locator('.filter-row')).toHaveCount(24);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expectNoOverflow(page);
        await expectContrast(page.locator('.filter-row').first().locator('.filter-summary-chip'));
        const listTrigger = page
          .locator('.filter-row')
          .first()
          .getByRole('button', { name: 'Acciones de Filtro 1', exact: true });
        await expectMenuKeyboard(page, listTrigger);
        const last = page.locator('.filter-row').last();
        await last.scrollIntoViewIfNeeded();
        if (viewport.width === 390) {
          const bottom = await page.locator('.bottom-bar').boundingBox();
          const row = await last.boundingBox();
          expect(row).not.toBeNull();
          expect(bottom).not.toBeNull();
          expect(row!.y + row!.height).toBeLessThanOrEqual(bottom!.y);
          const padding = await page.locator('.filters-page').evaluate((node) => {
            const style = getComputedStyle(node);
            return {
              actual: Number.parseFloat(style.paddingBottom),
              required: Number.parseFloat(style.getPropertyValue('--bottombar-h')),
            };
          });
          expect(padding.actual).toBeGreaterThanOrEqual(padding.required);
        }
        const link = page.locator('.filter-row').first().getByRole('link');
        await link.focus();
        await link.press('Shift+F10');
        await expect(page.getByRole('menu')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(listTrigger).toBeFocused();
        await link.press('Enter');
        await expect(page).toHaveURL(/\/filter\/seed-1$/);
        await expectNoOverflow(page);
        await expectNamedControls(page.locator('#content'));
        await expectMenuKeyboard(
          page,
          page.locator('#content').getByRole('button', { name: 'Acciones', exact: true }),
        );
        if (viewport.width === 390) await listsButton(page).click();
        const side = page
          .locator('.sidebar .nav-row')
          .filter({ has: page.locator('a[href="/filter/seed-1"]') });
        await side.hover();
        const sideTrigger = side.getByRole('button', { name: 'Acciones de Filtro 1', exact: true });
        await expectMenuKeyboard(page, sideTrigger);
      });

      test('CA-101-1 RF-902/1902: editor labels, focus, live preview and mobile targets', async ({
        page,
      }) => {
        await boot(page);
        await page.goto('/filters');
        const create = page.locator('#content').getByRole('button', { name: 'Nuevo filtro' });
        await create.click();
        const dialog = page.getByRole('dialog', { name: 'Nuevo filtro' });
        const name = dialog.getByRole('textbox', { name: 'Nombre', exact: true });
        await expect(name).toBeFocused();
        await name.press('Tab');
        await expect(dialog.getByRole('radio', { name: 'Sin color', exact: true })).toBeFocused();
        await expectNoOverflow(page);
        await expect(dialog.getByRole('group', { name: 'Condiciones', exact: true })).toBeVisible();
        await expectNamedControls(dialog);
        // Tab traverses the actual controls and wraps without reaching the page behind the modal.
        const first = dialog.getByRole('button', { name: 'Cerrar', exact: true });
        await first.focus();
        await page.keyboard.press('Shift+Tab');
        await expect(dialog.locator(':focus')).toHaveCount(1);
        await page.keyboard.press('Tab');
        await expect(first).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await create.click();
        await name.fill('Accesible');
        await dialog.getByLabel('Valor de Palabra').fill('solo-alguna');
        const narrow = viewport.width === 390;
        await enablePreview(dialog, narrow);
        const live = dialog.locator('[aria-live="polite"]');
        await expect(live).toHaveText('0 tareas coinciden');
        const previewRequests: string[] = [];
        page.on('request', (request) => {
          if (request.url().includes('/filters/preview'))
            previewRequests.push(request.postData() ?? '');
        });
        const word = dialog.getByLabel('Valor de Palabra');
        await word.fill('intermedio');
        await word.fill('solo-alguna final');
        await expect.poll(() => previewRequests.length).toBe(1);
        expect(previewRequests[0]).toContain('solo-alguna final');
        await expect(live).toHaveText('0 tareas coinciden');
        await dialog.getByRole('radio', { name: 'Alguna', exact: true }).click();
        await expect(live).toHaveText('2 tareas coinciden');
        await expectContrast(name);
        await dialog.getByRole('button', { name: 'Campo: Palabra' }).click();
        await page.getByRole('option', { name: 'Etiqueta', exact: true }).click();
        await dialog.getByRole('button', { name: 'Añadir etiqueta…' }).click();
        await page.getByRole('checkbox', { name: 'casa', exact: true }).check();
        await page.keyboard.press('Escape');
        await expectNamedControls(dialog);
        if (narrow) {
          await expectTap(dialog.getByRole('button', { name: 'Quitar condición Etiqueta' }));
          await expectTap(dialog.getByRole('button', { name: 'Quitar casa' }));
          for (const color of await dialog.locator('.list-color').all()) await expectTap(color);
        }
        await page.keyboard.press('Escape');
        const discard = page.getByRole('alertdialog');
        await expect(discard).toBeVisible();
        await discard.getByRole('button', { name: 'Seguir editando', exact: true }).click();
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button', { name: 'Guardar filtro' }).first().click();
        await expect(page.getByRole('heading', { name: 'Accesible', exact: true })).toBeFocused();
      });

      test('CA-101-1 RF-903: deletion focus, announcements and reduced motion', async ({
        page,
      }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await boot(page, 2);
        await page.goto('/filters');
        const live = page.locator('.filter-live');
        await expect(live).toHaveAttribute('aria-live', 'polite');
        const trigger = page
          .locator('#content')
          .getByRole('button', { name: 'Acciones de Filtro 1', exact: true });
        await trigger.click();
        await expectNoMotion(page.getByRole('dialog'));
        await page.getByRole('menuitem', { name: 'Fijar arriba', exact: true }).click();
        await expect(live).toHaveText('Filtro fijado');
        await trigger.click();
        await page.getByRole('menuitem', { name: 'Desfijar', exact: true }).click();
        await expect(live).toHaveText('Filtro desfijado');
        await trigger.click();
        await page.getByRole('menuitem', { name: 'Eliminar', exact: true }).click();
        const confirm = page.getByRole('alertdialog');
        await expect(confirm.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
        await confirm.getByRole('button', { name: 'Eliminar', exact: true }).click();
        await expect(page.locator('[data-filter-id="seed-2"] .filter-link')).toBeFocused();
        await expectNoMotion(page.locator('.toast'));
        await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
        await expect(live).toHaveText('Filtro restaurado');
        await trigger.click();
        await page.getByRole('menuitem', { name: 'Duplicar', exact: true }).click();
        await expect(live).toHaveText('Filtro duplicado');
      });

      test('polishes the field picker, match and groups', async ({ page }) => {
        test.setTimeout(90_000);
        const narrow = viewport.width < 1024;
        await boot(page);
        await page.goto('/filters');
        await page.locator('#content').getByRole('button', { name: 'Nuevo filtro' }).click();
        const dialog = page.getByRole('dialog', { name: 'Nuevo filtro' });
        await expect(dialog.locator('select')).toHaveCount(0);
        await expect(previewSwitch(dialog, narrow)).not.toBeChecked();
        await enablePreview(dialog, narrow);
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
        await expect(dialog.getByRole('button', { name: 'Hasta', exact: true })).toBeVisible();
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
        await expectNoOverflow(page);
        await expectNamedControls(dialog);
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
          const field = dialog.getByRole('button', { name: 'Campo: Prioridad' });
          const fieldBox = await field.boundingBox();
          expect(fieldBox?.height ?? 0).toBeLessThanOrEqual(36);
          expect(fieldBox?.height ?? 0).toBeGreaterThanOrEqual(28);
        }
      });
    });
  }
}

function previewSwitch(dialog: Locator, narrow: boolean): Locator {
  const root = narrow ? dialog.locator('.filter-editor-bar') : dialog.locator('.filter-preview');
  return root.locator('input[role="switch"]');
}

async function enablePreview(dialog: Locator, narrow: boolean): Promise<void> {
  await previewSwitch(dialog, narrow).click({ force: true });
  await expect(previewSwitch(dialog, narrow)).toBeChecked();
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

async function boot(page: Page, count = 0): Promise<void> {
  const filters: Array<Record<string, unknown>> = Array.from({ length: count }, (_, index) => ({
    id: `seed-${String(index + 1)}`,
    name: `Filtro ${String(index + 1)}`,
    color: null,
    pinned: false,
    mode: 'normal',
    rules: {
      combinator: 'AND',
      groups: [
        { combinator: 'AND', conditions: [{ field: 'keyword', op: 'contains', value: 'casa' }] },
      ],
    },
    task_count: 0,
  }));
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

async function expectNoOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

async function expectMenuKeyboard(page: Page, trigger: Locator): Promise<void> {
  await trigger.focus();
  await trigger.press('Enter');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(
    menu.locator(':focus'),
    `Initial focus: ${await trigger.getAttribute('aria-label')} at ${page.url()}`,
  ).toHaveCount(1);
  const items = menu.locator('[role="menuitem"]');
  await expectNamedControls(menu);
  if (page.viewportSize()?.width === 390) {
    await expectTap(trigger);
    for (const item of await items.all()) await expectTap(item);
  }
  // The view menu starts with view-mode radios; exercise the action list from its first item.
  await items.first().focus();
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
}

async function expectNamedControls(root: Locator): Promise<void> {
  const controls = root.locator('button, input, [role="radiogroup"], [role="group"]');
  for (const control of await controls.all()) {
    if (await control.isVisible()) await expect(control).toHaveAccessibleName(/\S/);
  }
}

async function expectNoMotion(root: Locator): Promise<void> {
  const moving = await root.evaluate(
    (node) =>
      [node, ...node.querySelectorAll('*')].filter((item) => {
        const style = getComputedStyle(item);
        return (
          style.animationName !== 'none' &&
          style.animationDuration.split(',').some((duration) => Number.parseFloat(duration) > 0)
        );
      }).length,
  );
  expect(moving).toBe(0);
}
