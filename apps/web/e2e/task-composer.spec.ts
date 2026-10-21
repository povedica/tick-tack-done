import { expect, test, type Page } from '@playwright/test';

async function fixture(page: Page, fail = false) {
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
        tag_ids: [],
        tags: [],
        project_name: 'Bandeja',
        column_id: null,
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
      await calendar.getByRole('button', { name: 'OK', exact: true }).click();
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
  await calendar.getByRole('button', { name: /^Hora/ }).click();
  await calendar.getByRole('textbox', { name: 'Hora', exact: true }).fill('18:30');
  await calendar.getByRole('button', { name: /^Recordatorio/ }).click();
  await calendar.getByRole('button', { name: '15 min antes', exact: true }).click();
  await calendar.getByRole('button', { name: /^Repetir/ }).click();
  await calendar.getByRole('button', { name: 'Cada semana', exact: true }).click();
  await calendar.getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByRole('button', { name: 'Opciones de tarea', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Bandeja', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Trabajo', exact: true }).click();
  await page.getByRole('button', { name: 'Opciones de tarea', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Etiqueta', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('checkbox', { name: 'personal importante', exact: true })
    .check();
  await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();
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
