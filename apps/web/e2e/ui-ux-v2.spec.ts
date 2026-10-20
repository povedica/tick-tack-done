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
  options: {
    dueDate?: string;
    title?: string;
    density?: string;
    accent?: string;
    configured?: boolean;
    todayCount?: number;
    reviewCount?: number;
    focusSeconds?: number;
    empty?: boolean;
  } = {},
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
    'tags',
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
    if (path === '/tasks')
      body = {
        items: completed
          ? []
          : options.todayCount === undefined
            ? [sampleTask]
            : Array.from({ length: options.todayCount }, (_, i) => ({
                ...sampleTask,
                id: `today-${String(i)}`,
                title: `Hoy ${String(i)}`,
                due_date: `2026-10-20T${String(9 + i).padStart(2, '0')}:00:00Z`,
              })),
        next_cursor: null,
      };
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
    if (path === '/stats/overview')
      body = {
        summary: {
          streak_current: 1,
          achievement: {
            enabled: true,
            score: 79,
            label: 'Al día',
            components: {
              tasks: { earned: 45.83, max: 50, configured: true },
              habits: { earned: 0, max: 20, configured: false },
              focus: { earned: 0, max: 20, configured: false },
              usage: { earned: 1.43, max: 10, configured: true },
            },
            topDeduction: 'Uso: 1/7 días registrados',
            history: [],
          },
        },
      };
    if (path === '/stats/overview' && options.empty)
      body = {
        summary: {
          streak_current: 0,
          achievement: { enabled: true, score: null, label: null, components: null, history: [] },
        },
      };
    if (path === '/dashboard/data')
      body = {
        generated_at: '2026-10-20T10:00:00Z',
        period: { from: '2026-10-13T10:00:00Z', time_zone: 'Europe/Madrid' },
        widgets: {
          completed_today: 3,
          completed_week: { value: 24, trend: 5 },
          overdue: 7,
          overdue_by_list: [
            {
              list_id: 'audit-list',
              name: 'Lista de prueba',
              total: 7,
              under_7: 2,
              days_7_30: 2,
              over_30: 3,
            },
          ],
          next_countdowns: { items: [], configured: options.configured ?? true },
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
          load: {
            total_active: 12,
            by_list: [{ list_id: 'audit-list', name: 'Lista de prueba', active: 7 }],
          },
          habits: {
            total: 0,
            percent: 0,
            configured: options.configured ?? true,
            complete: true,
            today: { done: 0, expected: 0 },
            pending_today: [],
          },
          tags: { items: [{ id: 'work', name: 'Trabajo', active: 4, recent_activity: true }] },
          focus: {
            seconds: options.focusSeconds ?? 1500,
            week_seconds: 7200,
            active: false,
            goal_seconds: null,
          },
          calendar: { upcoming: 0, items: [], configured: options.configured ?? true },
          integrations: { telegram: true, google: false, drive: false },
        },
      };
    if (path === '/dashboard/data') {
      const dashboard = body as { widgets: Record<string, unknown> };
      const projects = dashboard.widgets.projects as { items: Record<string, unknown>[] };
      if (options.reviewCount !== undefined)
        projects.items = [
          ...Array.from({ length: options.reviewCount }, (_, i) => ({
            id: `review-${String(i)}`,
            name: `Proyecto por revisar ${String(i + 1)}`,
            state: i === 0 ? 'no_pending' : 'stale',
            needs_review: true,
            active_tasks: i === 0 ? 0 : 3,
          })),
          ...projects.items.filter((item) => item.needs_review !== true),
        ];
      if (options.empty)
        Object.assign(dashboard.widgets, {
          completed_today: 0,
          completed_week: { value: 0 },
          overdue: 0,
          overdue_by_list: [],
          next_7_days: 0,
          projects: { items: [] },
          load: { by_list: [] },
          focus: { seconds: 0 },
        });
    }
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

test('garden v3: fixed KPI order and visible secondary numbers', async ({ page }) => {
  await fixtures(page);
  await page.goto('/dashboard');
  await expect(page.locator('[data-garden-group="kpi"] h2')).toHaveText([
    'Puntuación',
    'Racha',
    'Completadas hoy',
    'Necesitan atención',
    'Próximos 7 días',
  ]);
  await expect(page.locator('[data-garden-widget="score"]')).toContainText('79');
  await expect(page.locator('[data-garden-widget="completed_today"]')).toContainText(
    '24 en 7 días',
  );
  await expect(page.locator('[data-garden-widget="overdue"]')).toContainText('12 activas');
  await expect(page.locator('.digital-garden')).not.toContainText('Ver desglose');
  await expect(page.locator('.digital-garden summary')).toHaveCount(1);
});

for (const width of [1440, 390]) {
  test(`garden v3: graphic map and accessible modal (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixtures(page, { reviewCount: 5 });
    await page.goto('/dashboard');
    const lists = page.locator('[data-garden-widget="load"]');
    await expect(lists.locator('.garden-bars > li')).toHaveCount(5);
    await expect(lists).toContainText('Proyectos por revisar');
    await expect(page.locator('[data-garden-widget="projects"]')).toHaveCount(0);
    await lists.locator('.garden-bars button').first().click();
    const modal = page.getByRole('dialog', { name: 'Listas', exact: true });
    await expect(modal).toBeVisible();
    await expect(modal.locator('[data-selected="true"]')).toContainText('Lista de prueba');
    await expect(modal.locator('table')).toContainText('7–30 días');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(modal.getByRole('button', { name: 'Cerrar', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    expect(
      await page.evaluate(() => document.querySelector('dialog')?.contains(document.activeElement)),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(lists.locator('.garden-bars button').first()).toBeFocused();
    await lists.getByRole('button', { name: 'Ver todas', exact: true }).click();
    await expect(modal.locator('.garden-bars > li')).toHaveCount(7);
    await modal.getByRole('button', { name: 'Cerrar', exact: true }).click();
    const tags = page.locator('[data-garden-widget="tags"]');
    await tags.locator('.garden-tag-cloud button').first().click();
    const tagModal = page.getByRole('dialog', { name: 'Etiquetas', exact: true });
    await expect(tagModal.locator('[data-selected="true"]')).toContainText('Trabajo');
    await page.keyboard.press('Escape');
    await tags.getByRole('button', { name: 'Ver todas', exact: true }).click();
    await expect(tagModal).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(tagModal).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const kpis = page.locator('[data-garden-group="kpi"]');
    expect(
      await kpis.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length),
    ).toBe(width === 390 ? 2 : 5);
    await page.screenshot({ path: `/tmp/garden-v3/verified-${width}.png`, fullPage: true });
  });
}

test('garden v3: unconfigured is distinct from zero, errors and missing data', async ({ page }) => {
  await fixtures(page, { configured: false, focusSeconds: 0 });
  await page.goto('/dashboard');
  await expect(page.locator('[data-garden-widget="habits"]')).toContainText('No activado');
  await expect(page.locator('[data-garden-widget="calendar"]')).toContainText(
    'Conectar calendario',
  );
  await expect(page.locator('[data-garden-widget="focus"]')).toContainText('0 min');
  await expect(page.locator('[data-garden-widget="habits"]')).not.toContainText('¡Hábitos');
  await page.route('**/api/v1/dashboard/data', (route) =>
    route.fulfill({ json: { widgets: { focus: {}, calendar: { available: false } } } }),
  );
  await page.reload();
  await expect(page.locator('[data-garden-widget="focus"]')).toContainText('Dato no disponible');
  await expect(page.locator('[data-garden-widget="calendar"]')).toContainText('No activado');
  await page.route('**/api/v1/dashboard/data', (route) =>
    route.fulfill({ status: 500, json: { error: { code: 'failed', message: 'failed' } } }),
  );
  await page.reload();
  await expect(page.locator('[data-garden-widget="focus"]')).toContainText(
    'No se ha podido cargar',
  );
});

test('garden v3: verified habit motivation, focus goal and full active countdown count', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/dashboard/data', (route) =>
    route.fulfill({
      json: {
        widgets: {
          habits: {
            configured: true,
            total: 2,
            complete: true,
            today: { done: 2, expected: 2 },
            pending_today: [],
          },
          focus: { seconds: 3600, goal_seconds: 3600 },
        },
      },
    }),
  );
  await page.route('**/api/v1/countdowns?**', (route) =>
    route.fulfill({
      json: {
        items: Array.from({ length: 8 }, (_, i) => ({
          id: String(i),
          title: `Hito ${i}`,
          kind: 'until',
          days: i + 1,
          reminders: [],
        })),
      },
    }),
  );
  await page.goto('/dashboard');
  await expect(page.locator('[data-garden-widget="habits"]')).toContainText(
    '¡Hábitos de hoy completados!',
  );
  await expect(page.locator('[data-garden-widget="focus"]')).toContainText(
    '¡Objetivo de foco alcanzado!',
  );
  await expect(page.locator('[data-garden-widget="next_countdowns"]')).toContainText('8activas');
  await expect(page.locator('[data-garden-widget="next_countdowns"]')).toContainText('Hito 0');
  await page.route('**/api/v1/dashboard/data', (route) =>
    route.fulfill({
      json: {
        widgets: {
          habits: { configured: true, total: 1, complete: false, today: { done: 1, expected: 1 } },
        },
      },
    }),
  );
  await page.reload();
  await expect(page.locator('[data-garden-widget="habits"]')).toContainText('Dato no disponible');
  await expect(page.locator('[data-garden-widget="habits"]')).not.toContainText('¡Hábitos');
});

test('garden v3: customization persists hidden cards including score and tags', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Personalizar', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Puntuación', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Etiquetas', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.reload();
  await expect(page.locator('[data-garden-widget="score"]')).toHaveCount(0);
  await expect(page.locator('[data-garden-widget="tags"]')).toHaveCount(0);
});

test('module order: drag, persist across reload, and avoid duplicate secondary navigation', async ({
  page,
}) => {
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
  await page.goto('/today');
  await expect(page.locator('.icon-rail > a').nth(1)).toHaveAttribute('href', '/dashboard');
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'Módulos', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.sidebar a[href="/dashboard"]')).toHaveCount(0);
  await expect(page.locator('.sidebar a[href="/calendar/week"]')).toHaveCount(0);
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
  await expect(page.locator('.calendar-week-number')).toContainText('S43');
  expect(
    await page.locator('.hour-board').evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.locator('.calendar-options>summary').click();
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
  const links = page.locator('.sidebar .nav-list .nav-link');
  await expect(links.first()).toBeVisible();
  expect(
    await links.evaluateAll((nodes) =>
      nodes.every(
        (node) =>
          getComputedStyle(node).color === 'rgb(25, 25, 25)' &&
          node.getBoundingClientRect().height >= 32,
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
  await page.locator('.detail-meta-chip').first().click();
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

test('global Control chip stays available on mobile and collapsed desktop', async ({ page }) => {
  await fixtures(page);
  await page.goto('/today');
  await page.locator('.sidebar .control-chip').click();
  await expect(
    page.getByRole('dialog', { name: 'Puntuación de control', exact: true }),
  ).toContainText('79');
  await page.keyboard.press('Escape');
  await page.keyboard.press('[');
  await expect(page.locator('.icon-rail .control-chip')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.mobile-control-bar .control-chip')).toBeVisible();
  await page.locator('.mobile-control-bar .control-chip').click();
  await expect(
    page.getByRole('dialog', { name: 'Puntuación de control', exact: true }),
  ).toContainText('Uso diario');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [1280, 390]) {
  for (const score of [100, 60, 36, null]) {
    test(`Control presentation: ${width}px score ${String(score)}, long streak and bounded breakdown`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await fixtures(page);
      await page.route('**/api/v1/stats/overview?*', (route) =>
        route.fulfill({
          json: {
            summary: {
              streak_current: 125,
              achievement: {
                enabled: true,
                score,
                components: {
                  tasks: { earned: 25, max: 50, configured: true },
                  usage: { earned: 10, max: 10, configured: true },
                },
              },
            },
          },
        }),
      );
      await page.goto('/today');
      const chip = page.locator(
        width === 390 ? '.mobile-control-bar .control-chip' : '.sidebar .control-chip',
      );
      const state =
        score === null ? 'Sin datos' : score >= 75 ? 'Al día' : score >= 50 ? 'Justo' : 'Atrasado';
      await expect(chip).toHaveText(`125 días · ${score === null ? '—' : String(score)}${state}`);
      await expect(chip).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(chip).toHaveCSS('border-top-width', '1px');
      await expect(chip).toHaveCSS('box-shadow', 'none');
      await expect(chip).toHaveCSS('font-size', '14px');
      await expect(chip.locator('strong')).toHaveCSS('font-weight', '600');
      await expect(chip.locator('svg')).toHaveAttribute('fill', 'none');
      expect(await chip.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await chip.click();
      const panel = page.getByRole('dialog', { name: 'Puntuación de control', exact: true });
      await expect(panel).toContainText(`${score === null ? '—' : String(score)} sobre 100`);
      expect(
        await panel.evaluate((node) => {
          const r = node.getBoundingClientRect();
          return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
        }),
      ).toBe(true);
      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
      if (width === 1280) {
        await page.keyboard.press('[');
        const compact = page.locator('.icon-rail .control-chip');
        await expect(compact).toHaveText(score === null ? '—' : String(score));
        await expect(compact).toHaveCSS('font-size', '14px');
        expect(await compact.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        await compact.click();
        expect(
          await panel.evaluate((node) => {
            const r = node.getBoundingClientRect();
            return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
          }),
        ).toBe(true);
      }
    });
  }
}

for (const width of [360, 390]) {
  test(`mobile More uses the same drawer as Lists (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await fixtures(page);
    await page.goto('/dashboard');
    const lists = page.locator('.bottom-bar').getByRole('button', { name: 'Listas', exact: true });
    const more = page.locator('.bottom-bar').getByRole('button', { name: 'Más', exact: true });
    await lists.click();
    await expect(page.locator('.sidebar')).toHaveCSS('transform', 'none');
    await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'open');
    const style = await page.locator('.sidebar').evaluate((node) => ({
      width: node.getBoundingClientRect().width,
      background: getComputedStyle(node).backgroundColor,
      left: node.getBoundingClientRect().left,
    }));
    await page.keyboard.press('Escape');
    await more.click();
    await expect(page.locator('.sidebar')).toHaveCSS('transform', 'none');
    await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'open');
    await expect(
      page.locator('.sidebar').getByRole('link', { name: 'Jardín', exact: true }),
    ).toBeVisible();
    expect(
      await page.locator('.sidebar').evaluate((node) => ({
        width: node.getBoundingClientRect().width,
        background: getComputedStyle(node).backgroundColor,
        left: node.getBoundingClientRect().left,
      })),
    ).toEqual(style);
    await expect(page.locator('.more-sheet')).toHaveCount(0);
    await page.locator('.sidebar').getByRole('link', { name: 'Jardín', exact: true }).click();
    await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'closed');
    await more.click();
    await expect(page.locator('.sidebar')).toHaveCSS('transform', 'none');
    await page.locator('.scrim').click({ position: { x: width - 4, y: 400 } });
    await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'closed');
    await more.click();
    await expect(page.locator('.sidebar')).toHaveCSS('transform', 'none');
    await page.screenshot({ path: `test-results/mobile-more-drawer-${width}.png` });
    await page.keyboard.press('Escape');
    await lists.click();
    await expect(page.locator('.sidebar')).toHaveCSS('transform', 'none');
    await expect(
      page.locator('.sidebar').getByRole('link', { name: 'Jardín', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator('.sidebar').getByRole('button', { name: 'Listas', exact: true }),
    ).toBeVisible();
  });
}

test('mobile Lists footer matches the reference and More has no footer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page);
  await page.route('**/api/v1/smart-lists', (route) =>
    route.fulfill({
      json: {
        items: [
          { id: 'completed', key: 'completed', enabled: true, task_count: 0, sort_order: '0' },
          { id: 'trash', key: 'trash', enabled: true, task_count: 0, sort_order: '1' },
        ],
      },
    }),
  );
  await page.goto('/dashboard');
  await page.locator('.bottom-bar').getByRole('button', { name: 'Listas', exact: true }).click();
  await expect(page.locator('.sidebar')).toHaveCSS('transform', 'none');
  const footer = page.locator('.sidebar-footer');
  await expect(footer.getByRole('link', { name: 'Completadas', exact: true })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'No haré', exact: true })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Papelera', exact: true })).toBeVisible();
  const positions = await footer.locator('.nav-link').evaluateAll((nodes) =>
    nodes
      .map((node) => ({ text: node.textContent?.trim(), top: node.getBoundingClientRect().top }))
      .sort((a, b) => a.top - b.top)
      .map((item) => item.text),
  );
  expect(positions).toEqual(['Completadas', 'No haré', 'Papelera']);
  for (const icon of await footer.locator('svg.footer-icon').all()) {
    await expect(icon).toBeVisible();
    await expect(icon).toHaveAttribute('width', '16');
  }
  await expect(footer.locator('.sidebar-theme-button')).not.toBeVisible();
  await expect(footer.locator('.collapse-button')).not.toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-lists-footer.png' });
  await page.keyboard.press('Escape');
  await page.locator('.bottom-bar').getByRole('button', { name: 'Más', exact: true }).click();
  await expect(page.locator('.sidebar')).toHaveCSS('transform', 'none');
  await expect(page.locator('.sidebar-footer .footer-icon')).toHaveCount(0);
  await expect(
    page.locator('.sidebar').getByRole('link', { name: 'Jardín', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-more-no-footer.png' });
});

test('secondary sidebar has no theme or collapse controls on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await fixtures(page);
  await page.goto('/dashboard');
  await expect(page.locator('.sidebar-footer button')).toHaveCount(0);
  await expect(
    page.locator('.icon-rail').getByRole('button', { name: 'Contraer la barra', exact: true }),
  ).toBeVisible();
});

for (const width of [1280, 390]) {
  test(`sidebar fixed smart lists and sentence-case group headers (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixtures(page);
    await page.addInitScript(() =>
      localStorage.setItem('tick-tack-done.sidebar-group.smart', 'closed'),
    );
    const keys = [
      'today',
      'tomorrow',
      'next_7_days',
      'all',
      'inbox',
      'no_date',
      'recently_added',
      'completed',
      'trash',
      'assigned_to_me',
      'someday',
    ];
    await page.route('**/api/v1/smart-lists', (route) =>
      route.fulfill({
        json: {
          items: keys.map((key, i) => ({
            id: key,
            key,
            sort_order: String(i),
            enabled: key === 'completed' || key === 'trash',
            task_count: 0,
          })),
        },
      }),
    );
    await page.goto('/dashboard');
    if (width === 390) {
      await page
        .locator('.bottom-bar')
        .getByRole('button', { name: 'Listas', exact: true })
        .click();
      await expect(page.locator('.sidebar')).toHaveCSS('transform', 'none');
    }
    const sidebar = page.locator('.sidebar');
    await expect(
      sidebar.getByRole('button', { name: 'Listas inteligentes', exact: true }),
    ).toHaveCount(0);
    await expect(sidebar.locator('.sidebar-smart-lists .nav-link')).toHaveCount(8);
    await expect(
      sidebar.locator('.sidebar-smart-lists').getByRole('link', { name: 'Hoy', exact: true }),
    ).toBeVisible();
    const group = sidebar
      .locator('.nav-group')
      .filter({ has: page.getByRole('button', { name: 'Listas', exact: true }) });
    await expect(group.locator('.nav-group-toggle')).toHaveCSS('text-transform', 'none');
    await group.locator('.nav-group-header').hover();
    await expect(group.getByRole('button', { name: 'Nueva lista', exact: true })).toBeVisible();
    await expect(group.locator('.nav-group-actions')).toHaveCSS('opacity', '1');
    await group.getByRole('button', { name: 'Nueva lista', exact: true }).click();
    await expect(group.locator('.nav-create input')).toBeVisible();
    for (const icon of await sidebar.locator('.sidebar-footer .footer-icon').all())
      await expect(icon).toBeVisible();
    await group.getByRole('button', { name: 'Nueva lista', exact: true }).click();
    await page.screenshot({ path: `test-results/sidebar-groups-${width}.png` });
    if (width === 390) await page.keyboard.press('Escape');
    await page.goto('/settings/smart-lists');
    const today = page
      .locator('.smart-settings-row')
      .filter({ has: page.getByRole('link', { name: 'Hoy 0', exact: true }) });
    await expect(today).toContainText('Siempre visible');
    await expect(today.locator('.smart-visibility-btn')).toHaveCount(0);
  });
}

for (const width of [1280]) {
  test(`account avatar menu replaces sidebar identity (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixtures(page);
    await page.goto('/today');
    if (width < 1024) {
      await page.locator('.bottom-bar').getByRole('button', { name: 'Más', exact: true }).click();
      await expect(page.locator('.sidebar')).toHaveCSS('transform', 'none');
    }
    await expect(page.locator('.sidebar .brand')).toHaveCount(0);
    const account = page.locator(
      width < 1024 ? '.sidebar .account-menu' : '.icon-rail .account-menu',
    );
    const trigger = account.locator('summary');
    await expect(trigger).toHaveText('A');
    await trigger.click();
    const panel = account.locator('.menu-card');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Ajustes', exact: true })).toHaveAttribute(
      'href',
      '/settings/account',
    );
    await expect(panel.getByRole('link', { name: 'Estadísticas', exact: true })).toHaveAttribute(
      'href',
      '/statistics',
    );
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: test.info().outputPath(`account-menu-${width}.png`) });
    await trigger.press('Escape');
    await expect(panel).toBeHidden();
    await trigger.click();
    await page.locator('.sidebar').click({ position: { x: 5, y: 400 } });
    await expect(panel).toBeHidden();
    await trigger.click();
    await panel.getByRole('link', { name: 'Estadísticas', exact: true }).click();
    await expect(page).toHaveURL(/\/statistics$/);
    await expect(account.locator('.menu-card')).toBeHidden();
  });
}

for (const width of [360, 390]) {
  test(`mobile More shows identity and pinned account actions (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await fixtures(page);
    await page.goto('/today');
    await page.locator('.bottom-bar').getByRole('button', { name: 'Más', exact: true }).click();
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toHaveCSS('transform', 'none');
    await expect(sidebar.locator('.sidebar-account-identity')).toContainText('Auditoría');
    await expect(sidebar.locator('.control-chip, .account-menu')).toHaveCount(0);
    const footer = sidebar.locator('.sidebar-more-footer');
    await expect(footer.getByRole('link', { name: 'Ajustes', exact: true })).toBeVisible();
    const logout = footer.getByRole('button', { name: 'Cerrar sesión', exact: true });
    await expect(logout).toBeVisible();
    const settingsBox = await footer.locator('a').boundingBox();
    const logoutBox = await logout.boundingBox();
    const sidebarBox = await sidebar.boundingBox();
    expect(logoutBox!.y).toBeGreaterThan(settingsBox!.y);
    expect(sidebarBox!.y + sidebarBox!.height - logoutBox!.y - logoutBox!.height).toBeLessThan(40);
    await page.screenshot({ path: test.info().outputPath(`mobile-more-account-${width}.png`) });
    let loggedOut = false;
    await page.route('**/auth/logout', async (route) => {
      loggedOut = true;
      await route.fulfill({ status: 204 });
    });
    await logout.click();
    await expect(page).toHaveURL(/\/login$/);
    expect(loggedOut).toBe(true);
  });
}

for (const width of [1440, 390]) {
  for (const theme of ['light', 'dark']) {
    test(`DET compact metadata and faithful description draft (${width}, ${theme})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await fixtures(page);
      await page.goto('/today?task=audit-task');
      await page.evaluate(
        (theme) => document.documentElement.setAttribute('data-theme', theme),
        theme,
      );
      await expect(page.getByRole('link', { name: 'Ayúdame con esta tarea' })).toBeVisible();
      await expect(page.locator('.detail-title-row .task-check')).toHaveCount(1);
      await expect(page.locator('.detail-meta-chip')).toHaveCount(4);
      await page.locator('.detail-description-preview').click();
      const field = page.locator('.detail-content');
      const text = 'Primera línea\nSegunda línea\n- lista\nLiteral: \\n';
      await field.fill(text);
      await page.reload();
      await page.locator('.detail-description-preview').click();
      await expect(field).toHaveValue(text);
      await field.blur();
      await page.evaluate(
        (theme) => document.documentElement.setAttribute('data-theme', theme),
        theme,
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `../../docs/reviews/assets/task-detail-2026-10-21/${width}-${theme}.png`,
      });
    });
  }
}

test('DET keyboard and pointer resizing persist within the available desktop space', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fixtures(page);
  await page.goto('/today?task=audit-task');
  const separator = page.getByRole('separator');
  const before = Number(await separator.getAttribute('aria-valuenow'));
  await separator.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(separator).toHaveAttribute('aria-valuenow', String(before + 16));
  const box = await separator.boundingBox();
  if (!box) throw new Error('missing resize handle');
  await page.mouse.move(box.x + 3, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x - 97, box.y + 100);
  await page.mouse.up();
  const width = Number(await separator.getAttribute('aria-valuenow'));
  expect(width).toBeGreaterThan(before + 16);
  expect(width).toBeLessThanOrEqual(1440 * 0.6);
  await page.reload();
  await expect(page.getByRole('separator')).toHaveAttribute('aria-valuenow', String(width));
});
