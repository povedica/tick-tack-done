import { expect, test, type Page } from '@playwright/test';

async function fixture(page: Page, fail = false, patches: Record<string, unknown>[] = []) {
  const creations: Record<string, unknown>[] = [];
  const created: Record<string, unknown>[] = [];
  await page.clock.install({ time: new Date('2026-10-20T10:00:00Z') });
  await page.addInitScript(() => {
    localStorage.setItem('tick-tack-done.account-prefs', '1');
    localStorage.setItem('tick-tack-done.locale', 'es');
  });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
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
        items: [
          { id: 'inbox', name: 'Bandeja', is_inbox: true, closed: false, kind: 'TASK' },
          { id: 'work', name: 'Trabajo', is_inbox: false, closed: false, kind: 'TASK' },
        ],
        next_cursor: null,
      };
    if (path === '/projects/work')
      body = { id: 'work', name: 'Trabajo', kind: 'TASK', view_mode: 'list' };
    if (path === '/tags')
      body = {
        items: [{ id: 'tag-1', name: 'personal importante', color: '#4772FA' }],
        next_cursor: null,
      };
    if (path === '/tasks' && route.request().method() === 'POST') {
      const request = route.request().postDataJSON() as Record<string, unknown>;
      creations.push(request);
      if (fail) {
        await route.fulfill({
          status: 500,
          json: { error: { code: 'failed', message: 'Failed' } },
        });
        return;
      }
      const title = String(request.raw_text).replace(/ mañana.*$/, '');
      const item = {
        id: `created-${creations.length}`,
        title,
        status: 'active',
        kind: request.kind ?? 'task',
        priority: request.priority ?? 'none',
        due_date: request.due_date ?? null,
        time_zone: 'Europe/Madrid',
        is_all_day: request.is_all_day ?? true,
        project_id: request.project_id ?? 'inbox',
        tag_ids: request.tag_ids ?? [],
        tags: [],
        project_name: 'Bandeja',
        column_id: request.column_id ?? null,
        parent_id: null,
        completed_at: null,
        created_at: '2026-10-20T10:00:00Z',
        repeat_rule: null,
        content: '',
        checklist_progress: { completed: 0, total: 0 },
        source: 'manual',
      };
      created.push(item);
      body = { ...item, warnings: [] };
    } else if (path === '/tasks') body = { items: created, next_cursor: null };
    if (
      path.includes('/views/') ||
      path === '/filters/preview' ||
      /\/smart-lists\/[^/]+\/tasks/.test(path) ||
      path === '/projects/work/tasks'
    )
      body = {
        count: created.length,
        groups: [{ key: 'all', name: '', tasks: created }],
        items: created,
        next_cursor: null,
        group_by: 'none',
        sort: 'due',
      };
    if (
      path.startsWith('/tasks/') &&
      route.request().method() === 'GET' &&
      !path.slice(7).includes('/')
    )
      body = created.find((task) => task.id === path.slice(7)) ?? {};
    if (/^\/tasks\/[^/]+$/.test(path) && route.request().method() === 'PATCH') {
      const patch = route.request().postDataJSON() as Record<string, unknown>;
      const task = created.find((task) => task.id === path.slice(7));
      if (task) Object.assign(task, patch);
      patches.push({ id: path.slice(7), ...patch });
      body = task ?? {};
    }
    if (path === '/calendar/events')
      body = {
        tasks: [],
        external: [
          {
            id: 'event',
            title: 'Reunión de equipo',
            starts_at: '2026-10-20T13:00:00Z',
            ends_at: '2026-10-20T14:00:00Z',
            is_all_day: false,
            color: '#4772FA',
          },
        ],
      };
    if (path === '/review/daily') body = { task_ids: [], tasks: [] };
    await route.fulfill({ json: body });
  });
  return creations;
}

for (const width of [1280, 390]) {
  test(`RF-101/102/601: consistent composer and anchored menus ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 850 });
    const creations = await fixture(page);
    for (const path of ['/today', '/smart/tomorrow', '/inbox', '/list/work']) {
      await page.goto(path);
      const field = page.locator('.task-composer input[name=title]');
      await expect(page.locator('.task-composer>input[type=file]')).toBeHidden();
      await field.fill('Preparar propuesta');
      await page.getByRole('button', { name: 'Fecha', exact: true }).click();
      const calendar = page.getByRole('dialog', { name: 'Fecha', exact: true });
      await expect(calendar).toBeVisible();
      const box = await calendar.boundingBox();
      expect(box?.width).toBeGreaterThan(280);
      expect(box && box.x >= 0 && box.x + box.width <= width).toBe(true);
      await page.screenshot({
        path: info.outputPath(`date-${path.replaceAll('/', '-')}-${width}.png`),
        fullPage: true,
      });
      await calendar.getByRole('button', { name: 'Mañana', exact: true }).click();
      await calendar.getByRole('button', { name: 'Hecho', exact: true }).click();
      await page.getByRole('button', { name: 'Opciones de tarea', exact: true }).click();
      const options = page.getByRole('dialog', { name: 'Opciones de tarea' });
      await options.getByRole('button', { name: 'Alta', exact: true }).click();
      await expect(field).toBeFocused();
      await field.press('Enter');
      await expect(field).toHaveValue('');
      expect(creations.at(-1)?.priority).toBe('high');
      expect(creations.at(-1)?.due_date).toContain('2026-10-20T22:00:00');
      expect(creations.at(-1)?.raw_text).toBe('Preparar propuesta');
    }
    await page.goto('/today');
    await expect(page.getByRole('region', { name: 'Agenda de hoy' })).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: /Planifica tu día|Planificar mi día/ }).first(),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`today-plan-entry-${width}.png`),
      fullPage: true,
    });
    await page.locator('.task-composer input[name=title]').fill('Nueva tarea');
    await page.getByRole('button', { name: 'Opciones de tarea', exact: true }).click();
    await page.screenshot({ path: info.outputPath(`options-${width}.png`), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Opciones de tarea' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('RF-102: explicit metadata survives failure and clearing the date overrides Today', async ({
  page,
}) => {
  const creations = await fixture(page, true);
  await page.goto('/today');
  const field = page.locator('.task-composer input[name=title]');
  await field.fill('No perder el borrador');
  await page.getByRole('button', { name: 'Fecha', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Quitar fecha', exact: true }).click();
  await field.press('Enter');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(field).toHaveValue('No perder el borrador');
  expect(creations[0]?.due_date).toBeNull();
});

test('RF-102/601/801: date, time, duration, recurrence, reminder and list survive the options menus', async ({
  page,
}) => {
  const creations = await fixture(page);
  await page.goto('/today');
  const field = page.locator('.task-composer input[name=title]');
  await field.fill('Preparar la reunión');
  await page.getByRole('button', { name: 'Fecha', exact: true }).click();
  const calendar = page.getByRole('dialog', { name: 'Fecha', exact: true });
  await calendar.getByRole('button', { name: 'Mañana', exact: true }).click();
  await calendar.getByRole('tab', { name: 'Duración', exact: true }).click();
  await calendar.getByRole('button', { name: '45 min', exact: true }).click();
  await calendar.getByRole('tab', { name: 'Fecha', exact: true }).click();
  await calendar.getByRole('textbox', { name: 'Hora', exact: true }).fill('18:30');
  await calendar.getByRole('button', { name: /^Recordatorio/ }).click();
  await calendar.getByRole('button', { name: '15 min antes', exact: true }).click();
  await calendar.getByRole('button', { name: /^Repetir/ }).click();
  await calendar.getByRole('button', { name: 'Cada semana', exact: true }).click();
  await calendar.getByRole('button', { name: 'Hecho', exact: true }).click();
  await page.getByRole('button', { name: 'Opciones de tarea', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Bandeja', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Trabajo', exact: true }).click();
  await page.getByRole('button', { name: 'Opciones de tarea', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Etiqueta', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('checkbox', { name: 'personal importante', exact: true })
    .check();
  await page.getByRole('dialog').getByRole('button', { name: 'Hecho', exact: true }).click();
  await field.press('Enter');
  await expect(field).toHaveValue('');
  expect(creations).toHaveLength(1);
  expect(creations[0]).toMatchObject({
    raw_text: 'Preparar la reunión',
    project_id: 'work',
    due_date: '2026-10-21T16:30:00.000Z',
    is_all_day: false,
    duration_minutes: 45,
    repeat_rule: 'RRULE:FREQ=WEEKLY',
    reminder_trigger: 'TRIGGER:-PT15M',
    tag_ids: ['tag-1'],
  });
});

test('RF-101/102: global capture uses the same composer, retains shared text and returns to Today', async ({
  page,
}, info) => {
  const creations = await fixture(page);
  await page.goto('/quick-add?text=Comprar%20pan');
  const field = page.locator('.task-composer input[name=title]');
  await expect(field).toHaveValue('Comprar pan');
  await page.getByRole('button', { name: 'Prioridad', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Opciones de tarea' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(field).toBeFocused();
  await page.screenshot({ path: info.outputPath('global-capture.png'), fullPage: true });
  await field.press('Enter');
  await expect(page).toHaveURL(/\/today/);
  expect(creations).toHaveLength(1);
  expect(creations[0]?.raw_text).toBe('Comprar pan');
});

for (const width of [1280, 390]) {
  test(`Today uses shared view icons and keeps habits in the last Kanban column ${width}`, async ({
    page,
  }) => {
    await fixture(page);
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/today');
    const controls = page.locator('.task-view-toggle');
    await expect(controls.getByRole('button', { name: 'Lista', exact: true })).toBeVisible();
    await expect(controls.getByRole('button', { name: 'Matriz', exact: true })).toBeVisible();
    await expect(controls.getByRole('button', { name: 'Kanban', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sugerencias', exact: true })).toHaveCount(0);
    const field = page.locator('.today .task-composer input[name=title]');
    await field.fill('Preparar informe');
    await field.press('Enter');
    await expect(page.locator('.today-task-groups .task-row').first()).toBeVisible();
    await controls.getByRole('button', { name: 'Kanban', exact: true }).click();
    await expect(page.locator('.today-layout')).toHaveClass(/is-kanban/);
    await expect(page.locator('.today-task-groups .task-row').first()).toBeVisible();
    await expect(
      page
        .locator('.today-task-groups')
        .getByRole('button', { name: 'Preparar informe', exact: true }),
    ).toBeVisible();
    const columns = page.locator('.today-layout');
    const order = await columns.evaluate((node) => {
      const task = node.querySelector('.today-task-groups .task-group')!.getBoundingClientRect();
      const habits = node.querySelector('.today-habits-column')!.getBoundingClientRect();
      return habits.left >= task.right;
    });
    expect(order).toBe(true);
    await page.screenshot({ path: `/tmp/today-kanban-${width}.png`, fullPage: true });
    await controls.getByRole('button', { name: 'Lista', exact: true }).click();
    await expect(page.locator('.today-layout')).not.toHaveClass(/is-kanban/);
    await page.goto('/smart/tomorrow');
    await expect(
      page.locator('.task-view-toggle').getByRole('button', { name: 'Matriz', exact: true }),
    ).toBeVisible();
    await page
      .locator('.task-view-toggle')
      .getByRole('button', { name: 'Kanban', exact: true })
      .click();
    await expect(page).toHaveURL(/view=kanban/);
    await page
      .locator('.task-view-toggle')
      .getByRole('button', { name: 'Matriz', exact: true })
      .click();
    await expect(page.locator('.matrix-board')).toBeVisible();
  });
}

test('Kanban opens contextual capture from header and space, and only shows detail for a selected task', async ({
  page,
}) => {
  const posts = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/today?group=priority');
  const field = page.locator('.today .task-composer input[name=title]');
  await field.fill(
    'Título muy largo de una tarea para comprobar que todo su contenido se ajusta al ancho de la tarjeta sin invadir ninguna columna vecina',
  );
  await field.press('Enter');
  await expect.poll(() => posts.length).toBe(1);
  await page
    .locator('.task-view-toggle')
    .getByRole('button', { name: 'Kanban', exact: true })
    .click();
  await expect(page.locator('.detail-slot')).toHaveCount(0);
  await expect(page.locator('.today .task-composer')).toHaveCount(0);
  const high = page.locator('.today-task-groups > .task-group').first();
  await high.locator('.kanban-column-add').click();
  const modal = page.locator('.calendar-quick-add');
  await expect(modal).toBeVisible();
  await modal.locator('input[name=title]').fill('Alta de columna');
  await modal.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1]?.priority).toBe('high');
  await high.locator('.kanban-add-space button').click();
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'Cancelar', exact: true }).click();
  const card = page.locator('.today-task-groups .task-row').filter({ hasText: 'Título muy largo' });
  const fits = await card.evaluate((node) => {
    const title = node.querySelector('.task-title')!.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    return (
      title.left >= box.left && title.right <= box.right && node.scrollWidth <= node.clientWidth
    );
  });
  expect(fits).toBe(true);
  await card.locator('.task-title').click();
  await expect(page.locator('.detail-slot')).toBeVisible();
  await page
    .locator('.detail-slot')
    .getByRole('button', { name: 'Cerrar', exact: true })
    .first()
    .click();
  await expect(page.locator('.detail-slot')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/today-kanban-refined.png', fullPage: true });
});

test('List Kanban opens the shared modal with its target column', async ({ page }) => {
  const posts = await fixture(page);
  await page.route('**/api/v1/projects/work/columns', (route) =>
    route.fulfill({
      json: { items: [{ id: 'todo', name: 'Pendientes', wip_limit: null }], next_cursor: null },
    }),
  );
  await page.goto('/list/work?view=kanban');
  const column = page
    .locator('.kanban-col')
    .filter({ has: page.getByRole('heading', { name: /Pendientes/ }) });
  await expect(column).toBeVisible();
  await expect(page.locator('.detail-slot')).toHaveCount(0);
  await column.locator('.kanban-column-add').click();
  await page.locator('.calendar-quick-add input[name=title]').fill('Preparar una propuesta');
  await page
    .locator('.calendar-quick-add')
    .getByRole('button', { name: 'Añadir', exact: true })
    .click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ project_id: 'work', column_id: 'todo' });
  await column.locator('.kanban-add-space button').click();
  await expect(page.locator('.calendar-quick-add')).toBeVisible();
});

test('Kanban direct URL opens columns without an empty detail pane', async ({ page }) => {
  await fixture(page);
  await page.goto('/today?view=kanban&group=priority');
  await expect(page.locator('.today-layout')).toHaveClass(/is-kanban/);
  await expect(page.locator('.detail-slot')).toHaveCount(0);
  await expect(page.locator('.today-task-groups .kanban-column-add')).toHaveCount(4);
  await page.locator('.today-task-groups .kanban-column-add').first().click();
  await expect(page.locator('.calendar-quick-add')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.calendar-quick-add')).toHaveCount(0);
});

test('Kanban card padding opens detail, hover only shades its card and dragging changes priority', async ({
  page,
}) => {
  const patches: Record<string, unknown>[] = [];
  const posts = await fixture(page, false, patches);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/today?group=priority');
  const field = page.locator('.today .task-composer input[name=title]');
  for (const title of ['Preparar propuesta', 'Otra tarea']) {
    await field.fill(title);
    await field.press('Enter');
    await expect(field).toHaveValue('');
  }
  await expect.poll(() => posts.length).toBe(2);
  await page
    .locator('.task-view-toggle')
    .getByRole('button', { name: 'Kanban', exact: true })
    .click();
  const card = page
    .locator('.today-task-groups .task-row')
    .filter({ hasText: 'Preparar propuesta' });
  const other = page.locator('.today-task-groups .task-row').filter({ hasText: 'Otra tarea' });
  await expect(other).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  const background = await other.evaluate((node) => getComputedStyle(node).backgroundColor);
  await card.hover();
  await expect(card).not.toHaveCSS('background-color', background);
  await expect(other).toHaveCSS('background-color', background);
  await card.click({ position: { x: 150, y: 5 } });
  await expect(page.locator('.detail-slot')).toBeVisible();
  await page
    .locator('.detail-slot')
    .getByRole('button', { name: 'Cerrar', exact: true })
    .first()
    .click();
  const high = page.locator('.today-task-groups > .task-group').first();
  await expect(page.locator('.detail-slot')).toHaveCount(0);
  await card.dragTo(high.locator('summary'), { sourcePosition: { x: 150, y: 5 } });
  await expect.poll(() => patches.some((patch) => patch.priority === 'high')).toBe(true);
  await expect(high.getByRole('button', { name: 'Preparar propuesta', exact: true })).toBeVisible();
  await expect(page.locator('.calendar-quick-add')).toHaveCount(0);
  await expect(page.locator('.detail-slot')).toHaveCount(0);
});

test('Kanban drag between list columns persists the destination column', async ({ page }) => {
  const patches: Record<string, unknown>[] = [];
  const posts = await fixture(page, false, patches);
  await page.route('**/api/v1/projects/work/columns', (route) =>
    route.fulfill({
      json: {
        items: [
          { id: 'todo', name: 'Pendientes' },
          { id: 'next', name: 'En curso' },
        ],
        next_cursor: null,
      },
    }),
  );
  await page.goto('/list/work?view=kanban');
  const source = page
    .locator('.kanban-col')
    .filter({ has: page.getByRole('heading', { name: /Pendientes/ }) });
  const target = page
    .locator('.kanban-col')
    .filter({ has: page.getByRole('heading', { name: /En curso/ }) });
  await source.locator('.kanban-column-add').click();
  await page.locator('.calendar-quick-add input[name=title]').fill('Mover entre secciones');
  await page
    .locator('.calendar-quick-add')
    .getByRole('button', { name: 'Añadir', exact: true })
    .click();
  await expect.poll(() => posts.length).toBe(1);
  await source.locator('.kanban-card').dragTo(target);
  await expect.poll(() => patches.some((patch) => patch.column_id === 'next')).toBe(true);
  await expect(
    target.getByRole('button', { name: 'Mover entre secciones', exact: true }),
  ).toBeVisible();
});

for (const path of ['/today?view=list', '/list/work?view=list']) {
  test(`Desktop list rows are compact, hover across their width and open detail from empty space ${path}`, async ({
    page,
  }) => {
    await fixture(page);
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto(path);
    const field = page.locator('.task-composer input[name=title]');
    await field.fill('Revisar propuesta');
    await field.press('Enter');
    const row = page.locator('.task-list .task-row').filter({ hasText: 'Revisar propuesta' });
    await expect(row).toBeVisible();
    const metrics = await row.evaluate((node) => ({
      row: node.getBoundingClientRect().height,
      parent: node.parentElement!.getBoundingClientRect().height,
      width: node.getBoundingClientRect().width,
    }));
    expect(metrics.row).toBe(40);
    expect(metrics.parent).toBe(40);
    const checkGap = await row.evaluate((node) => {
      const check = node.querySelector('.task-check-svg')!.getBoundingClientRect();
      const title = node.querySelector('.task-title')!.getBoundingClientRect();
      return title.left - check.right;
    });
    expect(checkGap).toBeGreaterThanOrEqual(7);
    expect(checkGap).toBeLessThanOrEqual(8);

    await page.mouse.move(0, 0);
    await expect(row).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await row.hover({ position: { x: metrics.width - 100, y: 5 } });
    await expect(row).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await row.click({ position: { x: metrics.width - 100, y: 5 } });
    await expect(page.locator('.detail-slot')).toBeVisible();
    await page.screenshot({
      path: path.startsWith('/today')
        ? '/tmp/ttd-compact-list-detail.png'
        : '/tmp/ttd-list-detail.png',
      fullPage: true,
    });
  });
}

for (const path of ['/today', '/tag/tag-1'])
  test(`TTD-AUD-92 global composer saves inherited context and appears in ${path}`, async ({
    page,
  }) => {
    const posts = await fixture(page);
    await page.goto(path);
    await page.keyboard.press('n');
    const dialog = page.locator('.calendar-quick-add');
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name=title]').fill('Nueva con contexto');
    await dialog.getByRole('button', { name: 'Añadir', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => posts.length).toBe(1);
    if (path === '/today')
      expect(posts[0]).toMatchObject({ due_date: '2026-10-19T22:00:00.000Z', is_all_day: true });
    else expect(posts[0]?.tag_ids).toEqual(['tag-1']);
    await expect(
      page.locator('.task-row').filter({ hasText: 'Nueva con contexto' }).first(),
    ).toBeVisible();
  });
