import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page) {
  const tags = [
    {
      id: 'personal',
      name: 'personal',
      color: '#4772FA',
      parent_id: null,
      sort_order: '20',
      active_task_count: 5,
    },
    {
      id: 'familia',
      name: 'familia',
      color: '#1F9D55',
      parent_id: null,
      sort_order: '10',
      active_task_count: 2,
    },
    {
      id: 'child',
      name: 'peques',
      color: null,
      parent_id: 'personal',
      sort_order: '30',
      active_task_count: 1,
    },
    {
      id: 'unused',
      name: 'sin uso',
      color: null,
      parent_id: null,
      sort_order: '40',
      active_task_count: 0,
    },
  ];
  const writes: { path: string; method: string; body: Record<string, unknown> }[] = [];
  let fail = false;
  await page.addInitScript(() => {
    localStorage.setItem('tick-tack-done.account-prefs', '1');
    localStorage.setItem('tick-tack-done.locale', 'es');
  });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const method = route.request().method();
    let body: unknown = { items: [], next_cursor: null };
    if (path === '/auth/session' || path === '/me')
      body = {
        id: 'test',
        display_name: 'Prueba',
        email: 'test@example.test',
        csrf_token: 'test',
        time_zone: 'Europe/Madrid',
        locale: 'es',
        features: {},
      };
    if (path === '/projects')
      body = {
        items: [{ id: 'inbox', name: 'Bandeja', is_inbox: true, closed: false, kind: 'TASK' }],
        next_cursor: null,
      };
    if (path === '/tags' && method === 'GET') body = { items: tags, next_cursor: null };
    if (path.startsWith('/tags') && method !== 'GET') {
      const data =
        method === 'DELETE' ? {} : (route.request().postDataJSON() as Record<string, unknown>);
      writes.push({ path, method, body: data });
      if (fail) {
        await route.fulfill({
          status: 409,
          json: { error: { code: 'tag_name_taken', message: 'Duplicate' } },
        });
        return;
      }
      const id = path.split('/').at(-1);
      if (method === 'PATCH') {
        const item = tags.find((tag) => tag.id === id)!;
        Object.assign(item, data);
        if (data.before_id) item.sort_order = '0';
        body = item;
      } else if (method === 'DELETE') {
        tags.splice(
          tags.findIndex((tag) => tag.id === id),
          1,
        );
        await route.fulfill({ status: 204 });
        return;
      } else if (path === '/tags/merge') {
        tags.splice(
          tags.findIndex((tag) => tag.id === data.source_id),
          1,
        );
        body = tags.find((tag) => tag.id === data.target_id);
      } else {
        const item = { ...tags[0]!, ...data, id: 'new', sort_order: '50', active_task_count: 1 };
        tags.push(item as (typeof tags)[number]);
        body = item;
      }
    }
    if (path.includes('/views/') || path.includes('/tasks'))
      body = { items: [], groups: [], count: 0, next_cursor: null };
    if (path === '/tasks' && new URL(route.request().url()).searchParams.has('tag'))
      body = {
        items: [
          {
            id: 'sample',
            title: 'Tarea de prueba',
            status: 'active',
            kind: 'task',
            priority: 'none',
            due_date: null,
            time_zone: 'Europe/Madrid',
            project_id: 'inbox',
            tag_ids: ['personal'],
            column_id: null,
            parent_id: null,
            sort_order: '1',
            checklist_progress: { completed: 0, total: 0 },
            repeat_rule: null,
            source: 'manual',
            content: '',
            created_at: '2026-10-20T10:00:00Z',
            completed_at: null,
            deleted_at: null,
          },
        ],
        next_cursor: null,
      };
    await route.fulfill({ json: body });
  });
  await page.goto('/today');
  return {
    writes,
    fail: (value: boolean) => {
      fail = value;
    },
  };
}

for (const width of [1280, 390]) {
  test(`RF-401/403: compact tag menu, search and editing ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const { writes } = await setup(page);
    if (width < 800)
      await page
        .locator('.bottom-bar')
        .getByRole('button', { name: 'Listas', exact: true })
        .click();
    const group = page
      .locator('.nav-group')
      .filter({ has: page.getByRole('button', { name: 'Buscar etiqueta', exact: true }) });
    const search = group.getByRole('textbox', { name: 'Buscar etiqueta', exact: true });
    await expect(search).toHaveCount(0);
    await group.getByRole('button', { name: 'Buscar etiqueta', exact: true }).click();
    await expect(search).toBeFocused();
    await search.fill('sin uso');
    await expect(group.getByRole('link', { name: 'sin uso', exact: true })).toBeVisible();
    await search.fill('inexistente');
    await expect(group.getByText('No hay etiquetas que coincidan.')).toBeVisible();
    await search.press('Escape');
    await expect(search).toHaveCount(0);
    await group
      .getByRole('button', { name: 'Acciones de etiqueta: personal', exact: true })
      .click();
    const popup = page.getByRole('dialog', { name: 'Acciones de etiqueta: personal', exact: true });
    const rect = await popup.boundingBox();
    expect(
      rect && rect.x >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= 900,
    ).toBeTruthy();
    await expect(popup.getByRole('textbox')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`tags-menu-${width}.png`) });
    await popup.getByRole('menuitem', { name: 'Editar etiqueta', exact: true }).click();
    await popup.getByRole('textbox', { name: 'Nombre', exact: true }).fill('personal renovado');
    await popup.getByRole('button', { name: '#FAA80C', exact: true }).click();
    await expect(
      popup.getByRole('combobox').getByRole('option', { name: 'peques', exact: true }),
    ).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`tags-edit-${width}.png`) });
    await popup.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(popup).toBeHidden();
    expect(writes[0]?.body).toMatchObject({
      name: 'personal renovado',
      color: '#FAA80C',
      parent_id: null,
    });
    const updated = group.getByRole('link', { name: /^personal renovado(?: 5)?$/ });
    await expect(updated).toBeVisible();
    await expect(updated.locator('svg')).toHaveCSS('color', 'rgb(250, 168, 12)');
  });
}

test('RF-401/403: create child, reorder, merge and delete require explicit confirmation', async ({
  page,
}) => {
  const { writes } = await setup(page);
  const open = async (name = 'personal') => {
    await page.getByRole('button', { name: `Acciones de etiqueta: ${name}`, exact: true }).click();
    return page.getByRole('dialog', { name: `Acciones de etiqueta: ${name}`, exact: true });
  };
  let popup = await open();
  await popup.getByRole('menuitem', { name: 'Añadir subetiqueta' }).click();
  await popup.getByRole('textbox', { name: 'Nombre', exact: true }).fill('nueva hija');
  await popup.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(popup).toBeHidden();
  expect(writes[0]?.body).toMatchObject({ name: 'nueva hija', parent_id: 'personal' });
  popup = await open();
  await popup.getByRole('menuitem', { name: 'Mover al principio' }).click();
  await expect(popup).toBeHidden();
  expect(writes[1]?.body.before_id).toBe('familia');
  popup = await open();
  await popup.getByRole('menuitem', { name: 'Fusionar con' }).click();
  await popup.getByRole('combobox').selectOption('familia');
  expect(writes).toHaveLength(2);
  await popup.getByRole('button', { name: 'Fusionar con', exact: true }).click();
  await expect(popup).toBeHidden();
  expect(writes[2]?.body).toEqual({ source_id: 'personal', target_id: 'familia' });
  popup = await open('familia');
  await popup.getByRole('menuitem', { name: 'Borrar', exact: true }).click();
  expect(writes).toHaveLength(3);
  await popup.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(popup).toBeHidden();
  popup = await open('familia');
  await popup.getByRole('menuitem', { name: 'Borrar', exact: true }).click();
  await popup.getByRole('button', { name: 'Borrar', exact: true }).click();
  await expect(popup).toBeHidden();
  expect(writes[3]).toMatchObject({ path: '/tags/familia', method: 'DELETE' });
});

test('RF-403: failed save keeps draft, retry succeeds and Escape restores trigger focus', async ({
  page,
}) => {
  const state = await setup(page);
  state.fail(true);
  const trigger = page.getByRole('button', { name: 'Acciones de etiqueta: personal', exact: true });
  await trigger.click();
  const popup = page.getByRole('dialog', { name: 'Acciones de etiqueta: personal', exact: true });
  await popup.getByRole('menuitem', { name: 'Editar etiqueta', exact: true }).click();
  await popup.getByRole('textbox', { name: 'Nombre', exact: true }).fill('nuevo nombre');
  await popup.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(popup.getByRole('alert')).toBeVisible();
  await expect(popup.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveValue(
    'nuevo nombre',
  );
  state.fail(false);
  await popup.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(popup).toBeHidden();
  const next = page.getByRole('button', {
    name: 'Acciones de etiqueta: nuevo nombre',
    exact: true,
  });
  await next.click();
  await page.keyboard.press('Escape');
  await expect(next).toBeFocused();
});

test('RF-401: chosen yellow propagates to task chips and survives navigation', async ({
  page,
}, info) => {
  await setup(page);
  await page.getByRole('button', { name: 'Acciones de etiqueta: personal', exact: true }).click();
  const popup = page.getByRole('dialog', { name: 'Acciones de etiqueta: personal', exact: true });
  await popup.getByRole('menuitem', { name: 'Editar etiqueta', exact: true }).click();
  await popup.getByRole('textbox', { name: 'Nombre', exact: true }).fill('10min');
  await popup.getByRole('button', { name: '#FAA80C', exact: true }).click();
  await popup.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(popup).toBeHidden();
  await page.goto('/tag/personal');
  const chip = page.locator('.task-meta .ui-tag').filter({ hasText: '10min' });
  await expect(chip).toBeVisible();
  await expect(chip.locator('svg')).toHaveCSS('color', 'rgb(250, 168, 12)');
  await expect(chip).toHaveAttribute('style', /--tag: #FAA80C/i);
  await page.screenshot({ path: info.outputPath('tags-yellow-task.png') });
});
