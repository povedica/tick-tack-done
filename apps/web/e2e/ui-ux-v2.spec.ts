import { expect, test, type Page } from '@playwright/test';

const initialOrder = [
  'calendar',
  'matrix',
  'countdowns',
  'focus',
  'habits',
  'ticky',
  'statistics',
  'dashboard',
  'reports',
  'review',
  'search',
];
const task = {
  id: 'audit-task',
  project_id: 'audit-list',
  parent_id: null,
  column_id: null,
  title: 'Revisión de prueba #personal',
  content: '',
  status: 'active',
  kind: 'task',
  priority: 'none',
  due_date: '2026-10-01T09:00:00Z',
  start_date: null,
  time_zone: 'Europe/Madrid',
  is_all_day: false,
  repeat_rule: 'RRULE:FREQ=MONTHLY;BYMONTHDAY=1',
  tag_ids: [],
  checklist_progress: { completed: 0, total: 0 },
  duration_minutes: 30,
  completed_at: null,
  created_at: '2026-10-01T08:00:00Z',
  source: 'manual',
};

async function fixtures(
  page: Page,
  options: { dueDate?: string; title?: string; density?: string; accent?: string } = {},
) {
  const sampleTask = {
    ...task,
    due_date: options.dueDate ?? task.due_date,
    title: options.title ?? task.title,
  };
  let order = [...initialOrder];
  const completions: unknown[] = [];
  let completed = false;
  let gardenLayout = [
    'completed_today',
    'completed_week',
    'overdue',
    'next_7_days',
    'projects',
    'flow',
    'load',
    'habits',
    'focus',
    'calendar',
    'next_countdowns',
    'integrations',
  ].map((widget_key, position) => ({
    widget_key,
    position,
    size: widget_key === 'projects' ? 'l' : position < 4 ? 's' : 'm',
    config: {},
  }));
  await page.clock.install({ time: new Date('2026-10-20T10:00:00Z') });
  await page.addInitScript(() => localStorage.setItem('tick-tack-done.account-prefs', '1'));
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    let body: unknown = { items: [], next_cursor: null };
    if (path === '/auth/session')
      body = {
        csrf_token: 'test',
        id: 'audit',
        email: 'audit@example.test',
        display_name: 'Auditoría',
      };
    if (path === '/me') {
      if (route.request().method() === 'PATCH') {
        const patch = route.request().postDataJSON() as {
          features?: { navigation_order?: string[] };
        };
        order = patch.features?.navigation_order ?? order;
      }
      body = {
        id: 'audit',
        email: 'audit@example.test',
        display_name: 'Auditoría',
        time_zone: 'Europe/Madrid',
        locale: 'es',
        density: options.density ?? 'comfortable',
        accent: options.accent ?? 'indigo',
        features: { navigation_order: order },
      };
    }
    if (path === '/projects')
      body = {
        items: [
          {
            id: 'audit-list',
            name: 'Bandeja',
            is_inbox: true,
            active_task_count: 1,
            closed: false,
            color: '#4772FA',
          },
        ],
        next_cursor: null,
      };
    if (path === '/tasks/audit-task')
      body = {
        ...sampleTask,
        content: '# Notas de prueba\n\n**Importante**',
        items: [],
        subtasks: [{ ...sampleTask, id: 'child', title: 'Subtarea con título legible #personal' }],
        activity: [],
      };
    if (path === '/tasks') body = { items: completed ? [] : [sampleTask], next_cursor: null };
    if (path === '/tasks/audit-task/complete') {
      completions.push(route.request().postDataJSON());
      completed = true;
      body = {
        ...sampleTask,
        status: 'completed',
        series: { materialized: true, next_due_date: '2026-11-01T10:00:00Z', eta_seconds: null },
      };
    }
    if (path === '/calendar/events')
      body = {
        tasks: [],
        external: [
          {
            id: 'hotel',
            title: 'Estancia multiday de prueba',
            starts_at: '2026-10-23T00:00:00Z',
            ends_at: '2026-10-26T00:00:00Z',
            is_all_day: true,
            time_zone: 'UTC',
            color: '#4772FA',
          },
        ],
      };
    if (path === '/achievements') body = { enabled: false, score: null };
    if (path === '/dashboard/data')
      body = {
        generated_at: '2026-10-20T10:00:00Z',
        period: { from: '2026-10-13T10:00:00Z', time_zone: 'Europe/Madrid' },
        widgets: {
          completed_today: 3,
          completed_week: { value: 24, trend: 5 },
          overdue: 7,
          projects: {
            open: 2,
            created_7d: 1,
            deleted_7d: 1,
            needs_review: 1,
            review_after_days: 30,
            items: [
              {
                id: 'stale',
                name: 'Proyecto sin movimiento',
                state: 'stale',
                needs_review: true,
                active_tasks: 3,
                created_7d: 0,
                completed_7d: 0,
                last_activity_at: '2026-08-01T12:00:00Z',
              },
              {
                id: 'new',
                name: 'Proyecto nuevo',
                state: 'new',
                needs_review: false,
                active_tasks: 2,
                created_7d: 2,
                completed_7d: 0,
              },
              {
                id: 'deleted',
                name: 'Proyecto eliminado',
                state: 'deleted',
                needs_review: false,
                active_tasks: 0,
                deleted_at: '2026-10-19T12:00:00Z',
              },
            ],
          },
          next_7_days: 12,
          flow: { created: 30, completed: 24, net: -6 },
          load: { by_list: [{ list_id: 'audit-list', name: 'Lista de prueba', active: 7 }] },
          habits: { total: 0, percent: 0 },
          focus: { seconds: 1500 },
          calendar: { upcoming: 0, items: [] },
          integrations: { telegram: true, google: false, drive: false },
        },
      };
    if (path === '/me/dashboard') {
      if (route.request().method() === 'PATCH')
        gardenLayout = (route.request().postDataJSON() as { widgets: typeof gardenLayout }).widgets;
      body = { name: 'Mi jardín', widgets: gardenLayout };
    }
    if (path === '/review/daily') body = { task_ids: [], tasks: [] };
    if (path === '/smart-lists') body = { items: [] };
    if (path === '/sync') body = { changes: [], next_cursor: null };
    await route.fulfill({ json: body });
  });
  return { completions };
}

test.use({ locale: 'es-ES', timezoneId: 'Europe/Madrid' });

for (const accent of ['indigo', 'violet']) {
  test(`garden respects the account accent and the shared sans typography (${accent})`, async ({
    page,
  }) => {
    await fixtures(page, { accent });
    await page.goto('/dashboard');
    await expect(page.locator('.garden-bars .garden-track > span').first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-accent', accent);
    const style = await page.evaluate(() => ({
      bar: getComputedStyle(document.querySelector('.garden-bars .garden-track > span')!)
        .backgroundColor,
      button: getComputedStyle(document.querySelector('.digital-garden .ui-button.is-primary')!)
        .backgroundColor,
      title: getComputedStyle(document.querySelector('#garden-title')!).fontFamily,
      body: getComputedStyle(document.body).fontFamily,
    }));
    expect(style.bar).toBe(style.button);
    expect(style.title).toBe(style.body);
    await expect(page.locator('.garden-welcome')).toHaveCount(0);
  });
}

test('garden contextualizes projects and filters review candidates and recent changes', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/dashboard');
  const projects = page.locator('[data-garden-widget="projects"]');
  await expect(projects).toContainText('1 nuevo y 1 eliminado');
  await projects.getByRole('button', { name: 'Por revisar (1)', exact: true }).click();
  await expect(
    projects.getByRole('link', { name: 'Proyecto sin movimiento', exact: true }),
  ).toBeVisible();
  await expect(projects.getByRole('link', { name: 'Proyecto nuevo', exact: true })).toHaveCount(0);
  await expect(projects).toContainText('más de 30 días');
  await projects.getByRole('button', { name: 'Nuevos y eliminados', exact: true }).click();
  await expect(projects.getByRole('link', { name: 'Proyecto nuevo', exact: true })).toBeVisible();
  await expect(projects).toContainText('Proyecto eliminado');
  await expect(projects.getByRole('link', { name: 'Proyecto eliminado', exact: true })).toHaveCount(
    0,
  );
});

test('RF-2101/3: garden has actionable data and persists hidden, reordered, resized widgets', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fixtures(page);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Jardín digital', exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Revisar mis pendientes', exact: true }),
  ).toHaveAttribute('href', '/review/weekly');
  await expect(page.locator('[data-garden-widget="habits"]')).toContainText(
    'Crea tu primer hábito',
  );
  await expect(page.locator('[data-garden-widget="flow"]')).toContainText('6 tareas más entraron');
  await page.getByRole('button', { name: 'Personalizar', exact: true }).click();
  await page
    .locator('[data-garden-editor="flow"]')
    .dragTo(page.locator('[data-garden-editor="completed_today"]'));
  await page
    .getByRole('combobox', { name: 'Tamaño: Tu ritmo esta semana', exact: true })
    .selectOption('l');
  await page.getByRole('checkbox', { name: 'Hábitos de hoy', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Guardar mi jardín', exact: true }).click();
  await expect(page.locator('[data-garden-widget="habits"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-garden-widget]').first()).toHaveAttribute(
    'data-garden-widget',
    'flow',
  );
  await expect(page.locator('[data-garden-widget="flow"]')).toHaveClass(/garden-size-l/);
  await expect(page.locator('[data-garden-widget="habits"]')).toHaveCount(0);
});

test('RF-2101: garden fits mobile, supports an empty layout, and keeps a failed save editable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page);
  await page.goto('/dashboard');
  await expect(page.locator('[data-garden-widget="flow"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Personalizar', exact: true }).click();
  const checked = page
    .getByRole('region', { name: 'Personalizar widgets' })
    .getByRole('checkbox', { checked: true });
  while ((await checked.count()) > 0) await checked.first().uncheck();
  await page.route('**/api/v1/me/dashboard', async (route) => {
    if (route.request().method() === 'PATCH')
      await route.fulfill({ status: 500, json: { error: { code: 'failed', message: 'failed' } } });
    else await route.fallback();
  });
  await page.getByRole('button', { name: 'Guardar mi jardín', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Tu selección sigue aquí');
  await page.unroute('**/api/v1/me/dashboard');
  await page.getByRole('button', { name: 'Guardar mi jardín', exact: true }).click();
  await expect(page.getByText('No hay widgets visibles.')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-garden-widget]')).toHaveCount(0);
});

test('module order: drag, persist across reload, and match both sidebars', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1800 });
  await fixtures(page);
  await page.goto('/settings/features');
  const source = page.locator('[data-module="dashboard"]');
  const target = page.locator('[data-module="calendar"]');
  await source.dragTo(target);
  await expect(page.locator('.module-order li').first()).toHaveAttribute(
    'data-module',
    'dashboard',
  );
  await page.reload();
  await expect(page.locator('.module-order li').first()).toHaveAttribute(
    'data-module',
    'dashboard',
  );
  await expect(page.locator('.icon-rail a').nth(2)).toHaveAttribute('href', '/dashboard');
  await expect(page.locator('.nav-group').nth(1).getByRole('link').first()).toHaveAttribute(
    'href',
    '/dashboard',
  );
});

test('REC-1/2 and TSK-6: UI completes with future materialization and a clean accessible title', async ({
  page,
}) => {
  const { completions } = await fixtures(page);
  await page.goto('/today');
  await page.getByRole('checkbox', { name: 'Completar «Revisión de prueba»', exact: true }).click();
  await expect.poll(() => completions.length).toBe(1);
  expect(completions[0]).toMatchObject({ advance: 'next_future', materialize_next: true });
});

test('SEM-1/3, CAL-1/2: one clipped span, no overflow and a persistent workweek', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/calendar/week');
  await expect(page.locator('.hour-span')).toHaveCount(1);
  await expect(page.locator('.hour-span')).toHaveCSS('grid-column-end', 'span 3');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('S43');
  expect(
    await page.locator('.hour-board').evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.getByRole('checkbox', { name: 'Solo semana laboral (L–V)' }).check();
  await expect(page.locator('.hour-col')).toHaveCount(5);
  await page.reload();
  await expect(page.locator('.hour-col')).toHaveCount(5);
});

test('MOV-1/3: mobile More has readable links and Calendar opens Agenda', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page);
  await page.goto('/today');
  await page.getByRole('button', { name: 'Más', exact: true }).click();
  const links = page.locator('.more-sheet a');
  await expect(links.first()).toBeVisible();
  expect(
    await links.evaluateAll((nodes) =>
      nodes.every(
        (node) =>
          getComputedStyle(node).color === 'rgb(25, 25, 25)' &&
          node.getBoundingClientRect().height >= 44,
      ),
    ),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await page.locator('.bottom-bar').getByRole('link', { name: 'Calendario', exact: true }).click();
  await expect(page).toHaveURL(/calendar\/agenda/);
});

test('DET-3/4, MOV-4 and POP-1: mobile detail renders Markdown, readable subtasks and a trapped date dialog', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page);
  await page.goto('/today?task=audit-task');
  await expect(page.getByRole('heading', { name: 'Notas de prueba' })).toBeVisible();
  await expect(page.locator('textarea.detail-title')).toHaveValue('Revisión de prueba');
  const subtask = page.locator('.detail-check .check-title');
  await expect(subtask).toContainText('Subtarea con título legible');
  expect(await subtask.evaluate((node) => node.getBoundingClientRect().width)).toBeGreaterThan(150);
  await page.locator('.detail-head .due-chip').click();
  const dialog = page.getByRole('dialog', { name: 'Fecha', exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

for (const width of [1280, 390]) {
  for (const density of ['comfortable', 'compact']) {
    test(`TSK-2: checkbox aligns with the first title line across views (${width}px, ${density})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await fixtures(page, {
        dueDate: '2026-10-20T09:00:00Z',
        density,
        title:
          'Revisión de prueba con un título suficientemente largo para ocupar varias líneas en móvil #personal',
      });
      const surfaces = [
        { path: '/today', row: '.task-row', title: '.task-title' },
        { path: '/inbox', row: '.task-row', title: '.task-title' },
        { path: '/matrix', row: '.matrix-card', title: '.task-title' },
        { path: '/calendar/agenda', row: '.agenda-row:has(.task-check)', title: '.agenda-card' },
      ];
      for (const surface of surfaces) {
        await page.goto(surface.path);
        if (surface.path === '/matrix' && width < 640)
          await page.getByRole('tab', { name: / 1$/ }).click();
        const row = page.locator(surface.row).first();
        await expect(row).toBeVisible();
        const offset = await row.evaluate((node, selector) => {
          const check = node.querySelector('.task-check-svg');
          const title = node.querySelector(selector);
          if (check === null || title === null) throw new Error('missing row content');
          const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
          let text: Node | null;
          do {
            text = walker.nextNode();
          } while (text !== null && text.textContent?.trim().length === 0);
          if (text === null) throw new Error('missing title text');
          const range = document.createRange();
          range.selectNodeContents(text);
          const firstLine = range.getClientRects()[0];
          if (firstLine === undefined) throw new Error('missing first line');
          const box = check.getBoundingClientRect();
          return Math.abs(box.top + box.height / 2 - firstLine.top - firstLine.height / 2);
        }, surface.title);
        expect(offset, `${surface.path} first-line offset`).toBeLessThanOrEqual(1.5);
      }
    });
  }
}
