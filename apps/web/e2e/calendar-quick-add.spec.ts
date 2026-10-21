import { expect, test, type Page } from '@playwright/test';

// The account zone must win over the browser's zone.
test.use({ timezoneId: 'America/New_York', hasTouch: true });

async function fixture(page: Page) {
  const posts: Record<string, unknown>[] = [];
  const tasks: Record<string, unknown>[] = [];
  await page.clock.install({ time: new Date('2026-10-21T10:00:00Z') });
  await page.addInitScript(() => localStorage.setItem('tick-tack-done.account-prefs', '1'));
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let body: unknown = { items: [], next_cursor: null };
    if (path === '/me' || path === '/auth/session')
      body = {
        id: 'user',
        email: 'test@example.test',
        display_name: 'Test',
        csrf_token: 'test',
        time_zone: 'Europe/Madrid',
        locale: 'es',
        features: {},
      };
    if (path === '/projects')
      body = {
        items: [
          { id: 'inbox', name: 'Bandeja', is_inbox: true, closed: false },
          { id: 'context', name: 'Trabajo', is_inbox: false, closed: false },
        ],
        next_cursor: null,
      };
    if (path === '/tags') body = { items: [{ id: 'tag', name: 'trabajo' }], next_cursor: null };
    if (path === '/tasks') {
      if (route.request().method() === 'POST') {
        const input = route.request().postDataJSON() as Record<string, unknown>;
        posts.push(input);
        const created = {
          id: 'created-' + String(posts.length),
          project_id: input.project_id ?? 'inbox',
          title: input.raw_text,
          content: input.content ?? '',
          kind: 'task',
          status: 'active',
          priority: input.priority ?? 'none',
          start_date: input.start_date ?? null,
          due_date: input.due_date ?? null,
          is_all_day: input.is_all_day ?? true,
          time_zone: 'Europe/Madrid',
          duration_minutes: input.duration_minutes ?? null,
          tag_ids: [],
          parent_id: null,
          column_id: null,
          repeat_rule: null,
          checklist_progress: { completed: 0, total: 0 },
          created_at: '2026-10-21T10:00:00Z',
          completed_at: null,
        };
        tasks.push(created);
        body = created;
      } else body = { items: tasks, next_cursor: null };
    }
    if (path === '/calendar/events') body = { external: [], tasks: [] };
    await route.fulfill({ status: route.request().method() === 'POST' ? 201 : 200, json: body });
  });
  return posts;
}

async function point(page: Page, day: string, hour: number) {
  await expect(page.locator('.hour-col').first()).toBeVisible();
  await page.locator('.hour-board').evaluate((node, hour) => {
    node.scrollTop = Math.max(0, hour - 2) * 48;
  }, hour);
  const dated = page.locator(`.hour-col[data-day="${day}"]`);
  const columns = page.locator('.hour-col');
  const column = (await dated.count())
    ? dated
    : columns.nth(
        (await columns.count()) === 7 ? (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7 : 0,
      );
  const box = await column.boundingBox();
  if (!box) throw new Error('Missing calendar column');
  return { x: box.x + box.width / 2, y: box.y + hour * 48 };
}

for (const view of ['week', 'day', 'multi-day']) {
  test(`TTD-AUD-74: ${view} snaps a click and renders the created task at its start`, async ({
    page,
  }) => {
    const posts = await fixture(page);
    await page.goto(`/calendar/${view}?date=2026-10-24`);
    const position = await point(page, '2026-10-24', 13 + 35 / 60);
    await page.mouse.click(position.x, position.y);
    const dialog = page.getByRole('dialog', { name: '¿Qué quieres hacer?', exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.locator('.hour-ghost')).toContainText('13:30');
    if (view === 'week')
      await page.screenshot({ path: test.info().outputPath('quick-add-week.png') });
    await dialog.getByRole('textbox', { name: 'Añadir tarea', exact: true }).fill('Comprar pan');
    await page.keyboard.press('Enter');
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toMatchObject({
      start_date: '2026-10-24T11:30:00.000Z',
      due_date: '2026-10-24T12:00:00.000Z',
      duration_minutes: 30,
      is_all_day: false,
      time_zone: 'Europe/Madrid',
    });
    await expect(page.locator('.hour-ghost')).toHaveCount(0);
    await expect(page.locator('.calendar-hour-task')).toContainText('Comprar pan');
    await expect(page.locator('.calendar-hour-task')).toHaveCSS('top', '648px');
  });
}

test('TTD-AUD-74: drag selects 90 minutes and keeps the selected context list', async ({
  page,
}) => {
  const posts = await fixture(page);
  await page.goto('/calendar/week?date=2026-10-24&project_id=context');
  const position = await point(page, '2026-10-24', 9);
  await page.mouse.move(position.x, position.y);
  await page.mouse.down();
  await page.mouse.move(position.x, position.y + 73, { steps: 8 });
  await page.mouse.up();
  const dialog = page.locator('.calendar-quick-add');
  await dialog.getByRole('textbox', { name: 'Añadir tarea', exact: true }).fill('Reunión');
  await page.keyboard.press('Enter');
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({
    project_id: 'context',
    start_date: '2026-10-24T07:00:00.000Z',
    due_date: '2026-10-24T08:30:00.000Z',
    duration_minutes: 90,
  });
});

test('TTD-AUD-74: month uses local midnight, shows a past date, and keeps text outside', async ({
  page,
}) => {
  const posts = await fixture(page);
  await page.goto('/calendar/month?date=2026-10-24');
  const cell = page.locator('.cal-cell[data-day="2026-10-09"]');
  await cell.click({ position: { x: 20, y: 50 } });
  await expect(cell).toHaveClass(/is-drafting/);
  const dialog = page.locator('.calendar-quick-add');
  await expect(dialog.locator('.composer-date')).toHaveClass(/is-past/);
  await dialog.getByRole('textbox', { name: 'Añadir tarea', exact: true }).fill('Cumpleaños');
  await page.locator('.calendar-toolbar').click({ position: { x: 4, y: 4 } });
  await expect(dialog.getByRole('textbox', { name: 'Añadir tarea', exact: true })).toHaveValue(
    'Cumpleaños',
  );
  await dialog.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ due_date: '2026-10-08T22:00:00.000Z', is_all_day: true });
  expect(posts[0]).not.toHaveProperty('start_date');
});

test('TTD-AUD-74: Escape restores focus and empty outside click removes the ghost', async ({
  page,
}) => {
  const posts = await fixture(page);
  await page.goto('/calendar/day?date=2026-10-24');
  const column = page.locator('.hour-col');
  await column.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.calendar-quick-add')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(column).toBeFocused();
  await expect(page.locator('.hour-ghost')).toHaveCount(0);
  expect(posts).toHaveLength(0);
  const position = await point(page, '2026-10-24', 16 + 35 / 60);
  await page.mouse.click(position.x, position.y);
  await expect(page.locator('.hour-ghost')).toContainText('16:30');
  await page.locator('.calendar-toolbar').click({ position: { x: 4, y: 4 } });
  await expect(page.locator('.calendar-quick-add')).toHaveCount(0);
  await expect(page.locator('.hour-ghost')).toHaveCount(0);
});

test('TTD-AUD-74: More options preserves content and dates in the full composer', async ({
  page,
}) => {
  const posts = await fixture(page);
  await page.goto('/calendar/day?date=2026-10-24&project_id=context');
  const position = await point(page, '2026-10-24', 9);
  await page.touchscreen.tap(position.x, position.y);
  const dialog = page.locator('.calendar-quick-add');
  await dialog.getByRole('textbox', { name: 'Añadir tarea', exact: true }).fill('Revisar');
  await dialog.locator('textarea').fill('Descripción conservada');
  await dialog.getByRole('button', { name: 'Prioridad', exact: true }).click();
  await page.getByRole('button', { name: 'Alta', exact: true }).click();
  await dialog.getByRole('button', { name: 'Etiqueta', exact: true }).click();
  await page.getByRole('checkbox', { name: 'trabajo', exact: true }).check();
  await page.keyboard.press('Escape');
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'nota.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Adjunto de prueba'),
  });
  await dialog.getByRole('button', { name: 'Más', exact: true }).click();
  await page.getByRole('button', { name: 'Más opciones', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const sheet = page.locator('.sheet');
  await expect(sheet.locator('input[name="title"]')).toHaveValue('Revisar');
  await expect(sheet.locator('textarea')).toHaveValue('Descripción conservada');
  await expect(sheet).toContainText('nota.txt');
  await sheet.locator('input[name="title"]').press('Enter');
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({
    content: 'Descripción conservada',
    project_id: 'context',
    duration_minutes: 30,
    start_date: '2026-10-24T07:00:00.000Z',
    tag_ids: ['tag'],
    priority: 'high',
  });
});

test('TTD-AUD-74: parser date, priority, tags and list override the clicked slot', async ({
  page,
}) => {
  const posts = await fixture(page);
  await page.goto('/calendar/day?date=2026-10-24&project_id=context');
  const position = await point(page, '2026-10-24', 9);
  await page.mouse.click(position.x, position.y);
  const title = page.locator('.calendar-quick-add input[name="title"]');
  await title.fill('Llamar a Ana #trabajo !alta ^casa mañana 10:00');
  await expect(page.locator('.calendar-quick-add .composer-date')).toContainText('10:00');
  await expect(page.locator('.calendar-quick-add .composer-calendar-footer')).toContainText('casa');
  await title.press('Enter');
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]?.raw_text).toBe('Llamar a Ana #trabajo !alta ^casa mañana 10:00');
  for (const key of [
    'start_date',
    'due_date',
    'duration_minutes',
    'project_id',
    'priority',
    'tag_ids',
  ])
    expect(posts[0]).not.toHaveProperty(key);
});

test('TTD-AUD-74: all-day row, multi-week, and Tab focus containment', async ({ page }) => {
  const posts = await fixture(page);
  await page.goto('/calendar/day?date=2026-10-24');
  const row = page.locator('.hour-allday-cell');
  await row.focus();
  await page.keyboard.press('Space');
  const dialog = page.locator('.calendar-quick-add');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="title"]').fill('Día completo');
  await dialog.getByRole('button', { name: 'Añadir', exact: true }).focus();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await dialog.locator('input[name="title"]').press('Enter');
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ due_date: '2026-10-23T22:00:00.000Z', is_all_day: true });
  await page.goto('/calendar/multi-week?date=2026-10-24');
  const cell = page.locator('.cal-cell[data-day="2026-10-24"]');
  await cell.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(cell).toBeFocused();
});

test('TTD-AUD-74: mobile uses a bottom sheet and desktop stays inside the viewport', async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/day?date=2026-10-24');
  const position = await point(page, '2026-10-24', 13 + 35 / 60);
  await page.touchscreen.tap(position.x, position.y);
  const dialog = page.locator('.calendar-quick-add');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  await page.screenshot({ path: test.info().outputPath('quick-add-mobile.png') });
  expect(box?.x).toBe(0);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeCloseTo(844, 0);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/calendar/week?date=2026-10-24');
  const edge = await point(page, '2026-10-25', 16);
  await page.mouse.click(edge.x, edge.y);
  await expect(dialog).toBeVisible();
  await expect
    .poll(async () => {
      const b = await dialog.boundingBox();
      return !!b && b.x >= 8 && b.y >= 8 && b.x + b.width <= 1272 && b.y + b.height <= 792;
    })
    .toBe(true);
});

test('TTD-AUD-74: day popover fits all four viewport corners', async ({ page }) => {
  await fixture(page);
  await page.goto('/calendar/day?date=2026-10-24');
  for (const hour of [0.1, 23.9]) {
    await point(page, '2026-10-24', hour);
    const column = await page.locator('.hour-col').boundingBox();
    if (!column) throw new Error('Missing column');
    for (const x of [column.x + 2, column.x + column.width - 2]) {
      await page.mouse.click(x, column.y + hour * 48);
      const dialog = page.locator('.calendar-quick-add');
      await expect(dialog).toBeVisible();
      await expect
        .poll(async () => {
          const box = await dialog.boundingBox();
          return (
            !!box &&
            box.x >= 8 &&
            box.y >= 8 &&
            box.x + box.width <= 1272 &&
            box.y + box.height <= 712
          );
        })
        .toBe(true);
      await page.keyboard.press('Escape');
    }
  }
});

test('TTD-AUD-74: touch hold and drag selects a range on mobile', async ({ page }) => {
  const posts = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/day?date=2026-10-24');
  const position = await point(page, '2026-10-24', 9);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [position] });
  await page.waitForTimeout(400); // Deliberate long-press gesture, not a rendering wait.
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: position.x, y: position.y + 73 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const dialog = page.locator('.calendar-quick-add');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="title"]').fill('Rango móvil');
  await dialog.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({
    duration_minutes: 90,
    start_date: '2026-10-24T07:00:00.000Z',
    due_date: '2026-10-24T08:30:00.000Z',
  });
});
