import { expect, test, type Page } from '@playwright/test';
test.use({ timezoneId: 'Europe/Madrid' });
const views = ['day', 'week', 'month', 'agenda', 'year', 'quarter', 'two-weeks', 'multi-day'];
async function fixture(
  page: Page,
  options: {
    count?: number;
    delayed?: boolean;
    error?: boolean;
    startOnly?: boolean;
    bars?: number;
    filtering?: boolean;
    allDayEvents?: boolean;
    lateTask?: boolean;
  } = {},
) {
  const task = {
    id: 'task',
    project_id: 'list',
    parent_id: null,
    column_id: null,
    title: 'Tarea sintética con título largo que conserva toda su información en el calendario',
    content: '',
    status: 'active',
    kind: 'task',
    priority: 'high',
    due_date: '2026-10-20T08:00:00Z',
    start_date: null,
    time_zone: 'Europe/Madrid',
    is_all_day: false,
    repeat_rule: null,
    tag_ids: options.filtering ? ['tag'] : [],
    checklist_progress: { completed: 0, total: 0 },
    duration_minutes: 60,
    completed_at: null,
    created_at: '2026-10-01T08:00:00Z',
    source: 'manual',
  };
  if (options.lateTask) {
    task.due_date = '2026-10-20T21:00:00Z';
    task.title = 'Revisando la app ticktackdone';
  }
  const base = {
    subscription_id: 'cal',
    calendar_id: 'cal',
    provider: 'google',
    time_zone: 'Europe/Madrid',
    description: null,
    location: null,
    color: '#0f766e',
    is_all_day: false,
  };
  const external = [
    {
      ...base,
      id: 'midnight',
      title: 'Evento real a medianoche',
      starts_at: '2026-10-19T22:00:00Z',
      ends_at: '2026-10-19T23:00:00Z',
    },
    {
      ...base,
      id: 'overlap',
      color: '#c2410c',
      title: 'Evento simultáneo',
      starts_at: '2026-10-20T08:30:00Z',
      ends_at: '2026-10-20T09:30:00Z',
    },
    {
      ...base,
      id: 'all',
      title: 'Evento de tres días',
      starts_at: '2026-10-18T22:00:00Z',
      ends_at: '2026-10-21T22:00:00Z',
      is_all_day: true,
    },
    {
      ...base,
      id: 'overnight',
      title: 'Evento con hora entre dos días',
      starts_at: '2026-10-20T21:00:00Z',
      ends_at: '2026-10-20T23:00:00Z',
    },
  ];
  await page.clock.install({ time: new Date('2026-10-20T10:00:00Z') });
  await page.addInitScript(() => localStorage.setItem('tick-tack-done.account-prefs', '1'));
  const completed = new Set<string>();
  let icalVisible = true;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let body: unknown = { items: [], next_cursor: null };
    if (path === '/auth/session' || path === '/me')
      body = {
        id: 'user',
        display_name: 'Prueba',
        email: 'test@example.test',
        csrf_token: 'test',
        locale: 'es',
        time_zone: 'Europe/Madrid',
        features: {},
      };
    if (path === '/tasks')
      body = {
        items: [
          task,
          {
            ...task,
            id: 'all-task',
            title: 'Cumpleaños sintético: tarea de todo el día',
            tag_ids: [],
            is_all_day: true,
            due_date: '2026-10-19T22:00:00Z',
          },
        ],
        next_cursor: null,
      };
    if (path === '/tasks/task') body = { ...task, items: [], subtasks: [], activity: [] };
    if (path === '/projects')
      body = {
        items: [
          {
            id: 'list',
            name: 'Lista sintética',
            color: '#4772fa',
            is_inbox: true,
            kind: 'task',
            sort_order: '1',
          },
        ],
        next_cursor: null,
      };
    if (path === '/calendar/events')
      body = {
        external: options.allDayEvents
          ? external.map((event) => (event.id === 'all' ? { ...event, is_all_day: true } : event))
          : external,
        tasks: [],
      };
    if (options.filtering && path === '/tags')
      body = { items: [{ id: 'tag', name: 'Trabajo' }], next_cursor: null };
    if (options.filtering && path === '/filters')
      body = { items: [{ id: 'filter', name: 'Prioridad alta' }], next_cursor: null };
    if (options.filtering && path === '/filters/filter/tasks')
      body = {
        groups: [{ key: 'none', label: '', tasks: [{ id: 'task' }] }],
        count: 1,
        group_by: 'none',
        sort: 'manual',
        next_cursor: null,
      };
    if (path === '/calendar/subscriptions/ical' && route.request().method() === 'PATCH') {
      icalVisible = route.request().postDataJSON().visible;
      body = { id: 'ical', summary: 'iCal sintético', provider: 'ical', visible: icalVisible };
    }
    if (path === '/calendar/subscriptions')
      body = {
        items: [
          {
            id: 'cal',
            summary: 'Calendario sintético',
            visible: true,
            color: '#4772fa',
            provider: 'google',
          },
          ...(options.filtering
            ? [
                {
                  id: 'ical',
                  summary: 'iCal sintético',
                  visible: icalVisible,
                  color: '#0f766e',
                  provider: 'ical',
                },
              ]
            : []),
        ],
        next_cursor: null,
      };
    if (path === '/tasks' && options.count !== undefined)
      body = {
        items: Array.from({ length: options.count }, (_, index) => ({
          ...task,
          id: `density-${index}`,
          title:
            index === 0
              ? 'Breve'
              : `Elemento ${index + 1}: título largo de prueba que necesita varias líneas para mantener toda su información`,
          is_all_day: true,
        })),
        next_cursor: null,
      };
    if (path === '/calendar/events' && options.count !== undefined && !options.allDayEvents)
      body = { external: [], tasks: [] };
    if (options.bars !== undefined && path === '/calendar/events')
      body = {
        tasks: [],
        external: Array.from({ length: options.bars }, (_, index) => ({
          ...external[2],
          id: `bar-${index}`,
          title: `Barra ${index + 1} con título multilínea que ocupa su altura natural sin pisar las otras barras del calendario`,
        })),
      };
    if (options.startOnly && path === '/calendar/events')
      body = {
        external: [],
        tasks: [{ id: 'start-only', start_date: task.due_date, due_date: null }],
      };
    if (path === '/tasks/start-only')
      body = {
        ...task,
        id: 'start-only',
        title: 'Tarea solo con inicio',
        start_date: task.due_date,
        due_date: null,
      };
    if ((path === '/tasks' || path === '/calendar/events') && options.delayed)
      await new Promise((resolve) => setTimeout(resolve, 700));
    if (path === '/calendar/events' && options.error) {
      await route.fulfill({
        status: 503,
        json: { code: 'unavailable', message: 'Prueba sintética' },
      });
      return;
    }
    if (path === '/tasks/task/complete' || path === '/tasks/start-only/complete') {
      completed.add(path.includes('start-only') ? 'start-only' : 'task');
      body = { ...task, status: 'completed' };
    }
    if (path === '/calendar/events' && options.startOnly && completed.has('start-only'))
      body = { external: [], tasks: [] };
    if (path === '/tasks' && completed.size) {
      const result = body as { items: { id: string }[] };
      result.items = result.items.filter((item) => !completed.has(item.id));
    }
    await route.fulfill({ json: body });
  });
}
for (const width of [1440, 390, 320])
  for (const theme of ['light', 'dark']) {
    test(`RF-1101/1103 eight calendar views ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 960 });
      await fixture(page);
      for (const view of views) {
        await page.goto(`/calendar/${view}?date=2026-10-20`);
        await expect(page.locator('.calendar-toolbar')).toBeVisible();
        if (view !== 'agenda' && width >= 700) {
          await expect(
            page.locator('.calendar-nav').getByRole('button', { name: 'Hoy', exact: true }),
          ).toBeVisible();
        }
        await page.evaluate(
          (theme) => document.documentElement.setAttribute('data-theme', theme),
          theme,
        );
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        if (width < 700) {
          await page.locator('.calendar-mobile-views > button').click();
          await expect(page.locator('.mobile-view-links a')).toHaveCount(6);
          await page.keyboard.press('Escape');
        }
        if (view === 'week' && width >= 700) {
          await expect(page.locator('.hour-col')).toHaveCount(7);
          await expect
            .poll(() => page.locator('.hour-board').evaluate((node) => node.scrollTop))
            .toBeGreaterThanOrEqual(8 * 48);
          await expect(page.locator('.hour-span')).toHaveCount(1);
          await expect(page.locator('.hour-span')).toHaveCSS('grid-column-end', 'span 3');
          if (width < 700)
            expect(
              await page
                .locator('.hour-board')
                .evaluate((node) => node.scrollWidth > node.clientWidth),
            ).toBe(true);
        }
        if (view === 'agenda') {
          const midnight = page
            .locator('.agenda-row')
            .filter({ hasText: 'Evento real a medianoche' });
          await expect(midnight.locator('time')).toHaveText('00:00 – 01:00');
          await expect(midnight.locator('input[type=checkbox]')).toHaveCount(0);
          await expect(midnight.locator('.calendar-event-mark')).toHaveCount(1);
          await expect(
            page
              .locator('.agenda-row')
              .filter({ hasText: 'Tarea sintética' })
              .locator('input[type=checkbox]'),
          ).toHaveCount(1);
        }
        if (view === 'day') {
          await expect(
            page.locator('.hour-allday').getByText('Evento con hora entre dos días'),
          ).toHaveCount(0);
          await expect(
            page.locator('.hour-col').getByText('Evento real a medianoche'),
          ).toBeVisible();
        }
        if (view === 'year') await expect(page.locator('.year-card')).toHaveCount(12);
        if (view === 'quarter' && width >= 700)
          await expect(page.locator('.year-card')).toHaveCount(3);
        await page.screenshot({
          path: `/tmp/ttd-calendar-final-${view}-${width}-${theme}.png`,
        });
      }
    });
  }

test('RF-1101: visible mini-calendar and complete mobile day sheet keep the selected date', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await fixture(page);
  await page.goto('/calendar/month?date=2026-10-20');
  await page.locator('.cal-cell.is-today strong button').click();
  const dialog = page.getByRole('dialog', { name: '2026-10-20' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Evento real a medianoche', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.locator('.calendar-period>button').click();
  await page.getByLabel('Fecha', { exact: true }).fill('2026-11-03');
  await expect(page).toHaveURL(/date=2026-11-03/);
  await page.locator('.calendar-mobile-views > button').click();
  await page.locator('.mobile-view-links').getByRole('link', { name: 'Día', exact: true }).click();
  await expect(page.locator('.calendar-period h1')).toContainText('noviembre');
  await page.locator('.calendar-mobile-views > button').click();
  const viewMenu = page.locator('.mobile-view-links');
  await expect(viewMenu.getByRole('link')).toHaveCount(6);
  await expect(viewMenu.getByRole('link').last()).toHaveText('Día');
  await expect(viewMenu.getByRole('button')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/date=2026-11-03/);
});

for (const count of [0, 1, 3, 10, 30])
  test(`RF-1101 measured month capacity: ${count} items`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await fixture(page, { count });
    await page.goto('/calendar/month?date=2026-10-20');
    const cell = page.locator('[data-day="2026-10-20"]');
    await expect(cell.locator('.calendar-cell-items > *')).toHaveCount(count);
    await expect
      .poll(async () => {
        const visible = await cell
          .locator('.calendar-cell-items > *')
          .evaluateAll(
            (nodes) =>
              nodes.filter((node) => getComputedStyle(node).visibility !== 'hidden').length,
          );
        const more = cell.locator('.calendar-overflow');
        const hidden = (await more.count())
          ? Number((await more.innerText()).match(/\d+/)?.[0])
          : 0;
        return visible + hidden;
      })
      .toBe(count);
    if (count <= 1) await expect(cell.locator('.calendar-overflow')).toHaveCount(0);
    if (count >= 10) {
      await expect(cell.locator('.calendar-overflow')).toBeVisible();
      await cell.locator('.calendar-overflow').click();
      await expect(page.getByRole('dialog').locator('.agenda-row')).toHaveCount(count);
      await page.keyboard.press('Escape');
    }
    await page.screenshot({
      path: `/tmp/ttd-calendar-final-density-${count}.png`,
    });
  });

test('RF-1902 menu dismissal, keyboard date jump, year URL and working weekends', async ({
  page,
}) => {
  await fixture(page);
  await page.goto('/calendar/year?date=2026-10-20');
  const more = page.locator('.calendar-mobile-views > button');
  await more.click();
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
  await more.click();
  await page.getByRole('link', { name: 'Trimestre', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/quarter/);
  await more.click();
  await page.locator('h1').click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.locator('.calendar-period > button').click();
  const pick = page.getByRole('button', { name: 'martes, 20 de octubre de 2026', exact: true });
  await pick.focus();
  await pick.press('ArrowRight');
  await expect(
    page.getByRole('button', { name: 'miércoles, 21 de octubre de 2026', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/date=2026-10-21/);
  await expect(page.locator('.calendar-period > button')).toBeFocused();
  await page.goto('/calendar/year?date=2026-10-20');
  await page.getByRole('button', { name: 'noviembre', exact: true }).click();
  await expect(page).toHaveURL(/month\?date=2026-11-01/);
  await page.reload();
  await expect(page.locator('h1')).toContainText('noviembre');
  await page.goto('/calendar/multi-day?date=2026-10-24');
  await page.getByRole('button', { name: 'Filtrar calendario' }).click();
  await page.getByLabel('Solo semana laboral (L–V)').check();
  await page.keyboard.press('Escape');
  await expect(page.locator('.hour-col')).toHaveCount(1);
  await expect(page.locator('h1')).toContainText('26');
});

test('RF-1101 fixed two-week window, legacy links and sticky hourly axis', async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem('tick-tack-done.calendar.view', 'multi-week'),
  );
  await page.goto('/today');
  await expect(page.locator('.bottom-bar a[href="/calendar/two-weeks"]')).toHaveCount(1);
  await page.goto('/calendar/multi-week?date=2026-10-20&weeks=6&project_id=list');
  await expect(page).toHaveURL(/\/calendar\/two-weeks\?/);
  await expect(page).not.toHaveURL(/weeks=/);
  await expect(page).toHaveURL(/project_id=list/);
  await expect(page.locator('.cal-cell')).toHaveCount(14);
  await expect(page.getByLabel('Número de semanas')).toHaveCount(0);
  await page.locator('.calendar-mobile-views > button').click();
  await expect(
    page.locator('.mobile-view-links').getByRole('link', { name: 'Dos semanas', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Periodo siguiente' }).click();
  await expect(page).toHaveURL(/date=2026-11-02/);
  await page.reload();
  await expect(page.locator('.cal-cell')).toHaveCount(14);
  await page.locator('.calendar-mobile-views > button').click();
  await expect(page.locator('.mobile-view-links [aria-current=page]')).toHaveText('Dos semanas');
  await page.keyboard.press('Escape');
  const grid = await page.locator('.cal-month').boundingBox();
  expect(grid!.x).toBeGreaterThanOrEqual(0);
  expect(grid!.x + grid!.width).toBeLessThanOrEqual(1280);
  expect(grid!.y + grid!.height).toBeLessThanOrEqual(844 - 44);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/calendar/week?date=2026-10-20');
  await expect
    .poll(() => page.locator('.hour-board').evaluate((n) => n.scrollTop))
    .toBeGreaterThanOrEqual(8 * 48);
  const board = page.locator('.hour-board');
  await board.evaluate((n) => {
    n.scrollLeft = n.scrollWidth;
  });
  const gutter = await page.locator('.hour-gutter').boundingBox();
  const box = await board.boundingBox();
  expect(Math.abs(gutter!.x - box!.x)).toBeLessThan(3);
  await page.locator('.hour-board').evaluate((n) => {
    n.scrollTop = 0;
  });
  await expect(page.getByRole('button', { name: 'Evento real a medianoche' })).toBeVisible();
});

test('RF-1102 start-only task uses the existing calendar contract', async ({ page }) => {
  await fixture(page, { startOnly: true });
  await page.goto('/calendar/agenda?date=2026-10-20');
  await expect(
    page.locator('.agenda-row').filter({ hasText: 'Tarea solo con inicio' }),
  ).toBeVisible();
  const row = page.locator('.agenda-row').filter({ hasText: 'Tarea solo con inicio' });
  await row.getByRole('checkbox').check();
  await expect(row).toHaveCount(0);
});

test('RF-1101 remote loading and failure never announce an empty calendar', async ({ page }) => {
  await fixture(page, { delayed: true, error: true });
  await page.goto('/calendar/agenda?date=2026-10-20');
  await expect(page.getByText('No hay tareas con fecha en este periodo.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('No hay tareas con fecha en este periodo.')).toHaveCount(0);
});

test('RF-1903 tablet, narrow mobile and 200% zoom composition', async ({ page }) => {
  test.setTimeout(90_000);
  await fixture(page);
  for (const [width, zoom, sample] of [
    [360, 1, ['agenda', 'quarter', 'week']],
    [768, 1, views],
    [1440, 2, views],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    for (const view of sample) {
      await page.goto(`/calendar/${view}?date=2026-10-20`);
      await expect(page.locator('.calendar-page .ui-skeleton')).toHaveCount(0);
      await page.evaluate((zoom) => {
        document.body.style.zoom = String(zoom);
      }, zoom);
      if (view === 'agenda') {
        await page.screenshot({ path: `/tmp/ttd-agenda-zoom-${width}.png` });
        await expect(page.locator('.calendar-toolbar')).toBeVisible();
      } else await expect(page.locator('h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `/tmp/ttd-calendar-final-${view}-${width}-zoom${zoom}.png`,
      });
    }
  }
});

test('RF-1103 midnight, exclusive all-day end and complete day detail', async ({ page }) => {
  await fixture(page);
  await page.goto('/calendar/month?date=2026-10-20');
  await page.locator('[data-day="2026-10-21"] strong button').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.agenda-day')).toHaveCount(1);
  await expect(dialog.locator('.agenda-day-head strong')).toHaveText('21');
  await expect(dialog.getByText('Evento de tres días', { exact: true })).toBeVisible();
  await expect(
    dialog
      .locator('.agenda-row')
      .filter({ hasText: 'Evento con hora entre dos días' })
      .locator('time'),
  ).toHaveText('00:00 – 01:00');
  await page.keyboard.press('Escape');
  await page.locator('[data-day="2026-10-22"] strong button').click();
  await expect(
    page.getByRole('dialog').getByText('Evento de tres días', { exact: true }),
  ).toHaveCount(0);
});

test('RF-1102 completion and visibility only mutate synthetic records', async ({ page }) => {
  await fixture(page);
  await page.goto('/calendar/agenda?date=2026-10-20');
  const row = page.locator('.agenda-row').filter({ hasText: 'Tarea sintética' });
  await expect(row).toBeVisible();
  await expect(page.locator('.agenda-row .calendar-event-mark').first()).toBeVisible();
  const eventCount = await page.locator('.agenda-row .calendar-event-mark').count();
  await row.getByRole('checkbox').check();
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: 'Filtrar calendario' }).click();
  await page.getByRole('checkbox', { name: 'Tareas', exact: true }).uncheck();
  await page.keyboard.press('Escape');
  await expect(page.locator('.agenda-row input[type=checkbox]')).toHaveCount(0);
  await expect(page.locator('.agenda-row .calendar-event-mark')).toHaveCount(eventCount);
});

test('RF-1103 spanning bars measure multiline heights and exact hidden totals', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fixture(page, { count: 0, bars: 10 });
  await page.goto('/calendar/month?date=2026-10-20');
  await expect(page.locator('.calendar-month-span')).toHaveCount(10);
  const bars = page.locator('.calendar-month-span');
  const visible = await bars.evaluateAll((nodes) =>
    nodes
      .filter((n) => getComputedStyle(n).visibility === 'visible')
      .map((n) => n.getBoundingClientRect().toJSON()),
  );
  for (let index = 1; index < visible.length; index++)
    expect(visible[index]!.top).toBeGreaterThanOrEqual(visible[index - 1]!.bottom);
  const cell = page.locator('[data-day="2026-10-20"]');
  await expect(cell.locator('.calendar-overflow')).toHaveText(`+${10 - visible.length} más`);
  await cell.locator('.calendar-overflow').click();
  await expect(page.getByRole('dialog').locator('.agenda-row')).toHaveCount(10);
  await page.screenshot({
    path: '/tmp/ttd-calendar-final-spanning-detail.png',
  });
});

test('RF-1101 late responses keep the selected period and birthday tasks keep checkboxes', async ({
  page,
}) => {
  await fixture(page, { delayed: true });
  await page.goto('/calendar/agenda?date=2026-10-20');
  const birthday = page.locator('.agenda-row').filter({ hasText: 'Cumpleaños sintético' });
  await expect(birthday.getByRole('checkbox')).toHaveCount(1);
  await page.goto('/calendar/month?date=2026-10-20');
  await page.locator('.calendar-period > button').click();
  await page.getByLabel('Fecha', { exact: true }).fill('2027-01-03');
  await expect(page.locator('h1')).toContainText('enero de 2027');
  await expect(page.locator('.cal-cell')).toHaveCount(42);
  await expect(page.locator('.calendar-cell-items .cal-pill')).toHaveCount(0);
  await expect(page).toHaveURL(/date=2027-01-03/);
});

test('RF-1902 visual evidence of mini-calendar, options and long mobile day sheet', async ({
  page,
}) => {
  await fixture(page, { count: 30 });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/calendar/month?date=2026-10-20');
  await page.locator('.calendar-period > button').click();
  await expect(page.locator('.calendar-jump-grid button')).toHaveCount(42);
  await page.screenshot({
    path: '/tmp/ttd-calendar-final-mini-calendar-320.png',
  });
  await page.keyboard.press('Escape');
  await page.locator('.calendar-mobile-views > button').click();
  await page.screenshot({
    path: '/tmp/ttd-calendar-final-options-320.png',
  });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-day="2026-10-20"] strong button').click();
  await expect(page.getByRole('dialog').locator('.agenda-row')).toHaveCount(30);
  await page.screenshot({
    path: '/tmp/ttd-calendar-final-day-sheet-390.png',
  });
  await page.getByRole('dialog').locator('.agenda-row').last().scrollIntoViewIfNeeded();
  await expect(page.getByRole('dialog').locator('.agenda-row').last()).toBeVisible();
  await page.screenshot({
    path: '/tmp/ttd-calendar-final-day-sheet-bottom-390.png',
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test(`RF-1101 year fits available viewport ${viewport.width}`, async ({ page }) => {
    await fixture(page);
    await page.setViewportSize(viewport);
    await page.goto('/calendar/year?date=2026-10-21');
    await expect(page.locator('.year-card')).toHaveCount(12);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (value) => document.documentElement.setAttribute('data-theme', value),
        theme,
      );
      const board = await page.locator('.year-board').boundingBox();
      const bottom =
        viewport.width < 700
          ? (await page.locator('.bottom-bar').boundingBox())!.y
          : viewport.height;
      expect(board!.x).toBeGreaterThanOrEqual(0);
      expect(board!.x + board!.width).toBeLessThanOrEqual(viewport.width);
      expect(board!.y + board!.height).toBeLessThanOrEqual(bottom);
      const cards = await page.locator('.year-card').evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            top: rect.top,
            bottom: rect.bottom,
            overflow: node.scrollHeight > node.clientHeight + 1,
          };
        }),
      );
      expect(cards.every((card) => card.bottom <= bottom && !card.overflow)).toBe(true);
      if (viewport.width < 700)
        expect(new Set(cards.map((card) => Math.round(card.top))).size).toBe(4);
    }
    await page.locator('.year-month').last().click();
    await expect(page).toHaveURL(/calendar\/month\?date=2026-12-01/);
  });
}

test('RF-1101 mobile compact week, view menu and directional touch navigation', async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/week?date=2026-10-21');
  await expect(page.locator('.mobile-week-day')).toHaveCount(7);
  await expect(page.locator('.mobile-week-mini > a')).toHaveCount(42);
  await expect(page.locator('.calendar-period h1')).toHaveText('octubre');
  await expect(page.locator('.calendar-mobile-views > button svg')).toHaveAttribute(
    'data-view',
    'week',
  );
  const header = await page.locator('.calendar-toolbar').boundingBox();
  expect(header!.height).toBe(52);
  const board = page.locator('.mobile-week-board');
  const box = await board.boundingBox();
  const bottom = (await page.locator('.bottom-bar').boundingBox())!.y;
  expect(box!.y + box!.height).toBeLessThanOrEqual(bottom);
  const task = page.locator('.mobile-week-chip').filter({ hasText: 'Tarea sintética' });
  await expect(task.locator('time')).toHaveText('10:00');
  await page.locator('.calendar-mobile-views > button').click();
  await expect(page.locator('.mobile-view-links [aria-current=page]')).toHaveText('Semana');
  await page.keyboard.press('Escape');
  await expect(page.locator('.calendar-mobile-views > button')).toBeFocused();
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });

  async function swipe(dx: number, dy: number) {
    await expect(board).toBeVisible();
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 220, y: 250 }],
    });
    for (let step = 1; step <= 4; step++) {
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 220 + (dx * step) / 4, y: 250 + (dy * step) / 4 }],
      });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await swipe(-100, 8);
  await expect(page).toHaveURL(/date=2026-10-26/);
  await swipe(100, 8);
  await expect(page).toHaveURL(/date=2026-10-19/);
  await swipe(10, -100);
  await expect(page).toHaveURL(/date=2026-10-19/);
  await swipe(25, 2);
  await expect(page).toHaveURL(/date=2026-10-19/);
  await board.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/date=2026-10-26/);
});

test('RF-1101 annual vertical touch navigation preserves the full overview', async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/year?date=2026-10-21');
  const board = page.locator('.year-board');
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });

  async function swipe(dx: number, dy: number) {
    await expect(board).toBeVisible();
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 200, y: 300 }],
    });
    for (let step = 1; step <= 4; step++) {
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 200 + (dx * step) / 4, y: 300 + (dy * step) / 4 }],
      });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await swipe(5, -100);
  await expect(page.locator('h1')).toHaveText('2027');
  await expect(page.locator('.year-card')).toHaveCount(12);
  await expect(page.getByRole('button', { name: 'Opciones del calendario' })).toHaveCount(0);
  await swipe(5, 100);
  await expect(page.locator('h1')).toHaveText('2026');
  await swipe(100, 5);
  await expect(page.locator('h1')).toHaveText('2026');
  await board.focus();
  await page.keyboard.press('PageUp');
  await expect(page.locator('h1')).toHaveText('2025');
});

for (const width of [390, 1280]) {
  test(`RF-1101 floating source filters preserve URL and filter tasks ${width}`, async ({
    page,
  }) => {
    await fixture(page, { filtering: true });
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/calendar/week?date=2026-10-20');
    await page.locator('.calendar-mobile-views > button').click();
    await page
      .locator('.mobile-view-links')
      .getByRole('link', { name: 'Año', exact: true })
      .click();
    await expect(page.locator('.calendar-mobile-views > button svg')).toHaveAttribute(
      'data-view',
      'year',
    );
    await page.locator('.calendar-mobile-views > button').click();
    await page
      .locator('.mobile-view-links')
      .getByRole('link', { name: 'Semana', exact: true })
      .click();
    await expect(page.locator('.calendar-mobile-views > button svg')).toHaveAttribute(
      'data-view',
      'week',
    );
    const filterButton = page.getByRole('button', { name: 'Filtrar calendario', exact: true });
    await expect(filterButton.locator('.calendar-filter-count')).toHaveCount(0);
    await filterButton.click();
    const panel = page.getByRole('dialog', { name: 'Filtrar calendario' });
    await expect(panel.getByLabel('Calendario sintético', { exact: true })).toBeChecked();
    await page.screenshot({ path: `/tmp/calendar-filter-refined-${width}.png` });
    if (width === 390) {
      await page.evaluate(() => {
        document.documentElement.dataset.theme = 'dark';
      });
      await page.screenshot({ path: '/tmp/calendar-filter-refined-dark.png' });
      await page.evaluate(() => {
        document.documentElement.dataset.theme = 'light';
      });
    }

    const visibilityRequest = page.waitForRequest(
      (request) =>
        request.url().endsWith('/calendar/subscriptions/ical') && request.method() === 'PATCH',
    );
    await panel.getByLabel('iCal sintético', { exact: true }).uncheck();
    expect((await visibilityRequest).postDataJSON()).toMatchObject({ visible: false });
    await panel.getByLabel('Filtros', { exact: true }).selectOption('filter');
    await panel.getByLabel('Etiquetas', { exact: true }).selectOption('tag');
    await panel.getByLabel('Lista del calendario', { exact: true }).selectOption('list');
    await expect(page).toHaveURL(/filter_id=filter/);
    await expect(page).toHaveURL(/tag_id=tag/);
    await expect(page).toHaveURL(/project_id=list/);
    await expect(filterButton.locator('.calendar-filter-count')).toHaveText('4');
    await expect(filterButton.locator('.calendar-filter-indicator')).toHaveCSS(
      'color',
      'rgb(0, 0, 0)',
    );
    await page.keyboard.press('Escape');
    await expect(filterButton).toBeFocused();
    const taskContainer = width < 700 ? '.mobile-week-chip' : '.hour-block';
    await expect(page.locator(taskContainer).filter({ hasText: 'Tarea sintética' })).toHaveCount(1);
    await expect(
      page.getByText('Cumpleaños sintético: tarea de todo el día', { exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await filterButton.click();
    await expect(panel.getByLabel('Filtros', { exact: true })).toHaveValue('filter');
    await expect(panel.getByLabel('Etiquetas', { exact: true })).toHaveValue('tag');
    await expect(panel.getByLabel('Lista del calendario', { exact: true })).toHaveValue('list');
    await panel.getByLabel('Tareas', { exact: true }).uncheck();
    await page.keyboard.press('Escape');
    await expect(page.locator(taskContainer).filter({ hasText: 'Tarea sintética' })).toHaveCount(0);
  });
}

test('RF-1902 first opening of views has stable visible geometry', async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/year?date=2026-10-21');
  await page.evaluate(() => {
    const samples: { x: number; y: number; width: number; height: number }[] = [];
    Object.assign(window, { viewSamples: samples });
    const sample = () => {
      const node = document.querySelector('.calendar-popover');
      if (node && getComputedStyle(node).visibility !== 'hidden') {
        const { x, y, width, height } = node.getBoundingClientRect();
        samples.push({ x, y, width, height });
      }
      if (samples.length < 12) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.locator('.calendar-mobile-views > button').click();
  await expect(page.locator('.mobile-view-links')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { viewSamples: unknown[] }).viewSamples.length),
    )
    .toBe(12);
  const samples = await page.evaluate(
    () =>
      (
        window as unknown as {
          viewSamples: { x: number; y: number; width: number; height: number }[];
        }
      ).viewSamples,
  );
  expect(
    samples.every((sample) =>
      Object.keys(sample).every(
        (key) =>
          Math.abs(sample[key as keyof typeof sample] - samples[0]![key as keyof typeof sample]) <
          1,
      ),
    ),
  ).toBe(true);
});

test('RF-1101 mobile day agenda fills most of the viewport and scrolls', async ({ page }) => {
  await fixture(page, { count: 30 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/month?date=2026-10-20');
  await page.locator('[data-day="2026-10-20"] strong button').click();
  const dialog = page.locator('.calendar-day-sheet');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.height).toBeGreaterThan(844 * 0.9);
  expect(box!.height).toBeLessThanOrEqual(844);
  const last = dialog.locator('.agenda-row').last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cerrar', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('RF-1101 monthly vertical touch navigation changes months', async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/month?date=2026-10-21');
  const board = page.locator('.cal-month');
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });

  async function swipe(dx: number, dy: number) {
    await expect(board).toBeVisible();
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 200, y: 300 }],
    });
    for (let step = 1; step <= 4; step++) {
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 200 + (dx * step) / 4, y: 300 + (dy * step) / 4 }],
      });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await swipe(5, -100);
  await expect(page.locator('h1')).toHaveText('noviembre de 2026');
  await expect(page.locator('.calendar-day-sheet')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Opciones del calendario' })).toHaveCount(0);
  await swipe(5, 100);
  await expect(page.locator('h1')).toHaveText('octubre de 2026');
  await swipe(100, 5);
  await expect(page.locator('h1')).toHaveText('octubre de 2026');
});

test('RF-1101 agenda starts today and loads months only on explicit request', async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const ranges: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/tasks?')) ranges.push(request.url());
  });
  await page.goto('/calendar/agenda');
  const timeline = page.locator('.calendar-agenda-timeline');
  const today = timeline.locator('[data-agenda-day="2026-10-20"]');
  await expect(today).toBeVisible();
  const toolbar = page.locator('.calendar-toolbar');
  await expect(toolbar.getByRole('button')).toHaveCount(3);
  await expect(toolbar.locator('.calendar-period, .calendar-nav, .calendar-add')).toHaveCount(0);
  await expect(today).toBeInViewport();
  const initialRange = new URL(ranges.at(-1)!);
  expect(initialRange.searchParams.get('due_after')).toBe('2026-08-31T21:59:59.999Z');
  expect(initialRange.searchParams.get('due_before')).toBe('2026-11-30T23:00:00.000Z');
  await timeline.evaluate((node) => {
    node.scrollTop = (node.scrollHeight - node.clientHeight) / 2;
  });
  await expect(timeline.locator('.calendar-agenda-extend').first()).toBeHidden();
  await expect(timeline.locator('.calendar-agenda-extend').last()).toBeHidden();
  expect(await timeline.locator('[data-agenda-day]').count()).toBeLessThan(10);
  const initialRequests = ranges.length;
  await timeline.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect(timeline.getByRole('button', { name: 'Ver mes siguiente' })).toBeVisible();
  await expect(timeline.getByRole('button', { name: 'Ver mes siguiente' })).toHaveText(
    'diciembre de 2026',
  );
  await expect(
    timeline.getByRole('button', { name: 'Ver mes siguiente' }).locator('svg'),
  ).toHaveCount(1);
  expect(ranges.length).toBe(initialRequests);
  await timeline.getByRole('button', { name: 'Ver mes siguiente' }).click();
  await expect.poll(() => ranges.length).toBeGreaterThan(initialRequests);
  const nextRequests = ranges.length;
  await timeline.evaluate((node) => {
    node.scrollTop = 0;
  });
  await timeline.getByRole('button', { name: 'Ver mes anterior' }).click();
  await expect.poll(() => ranges.length).toBeGreaterThan(nextRequests);
});

test('RF-1902 mobile calendar bottom bar opens lists and main navigation separately', async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/month?date=2026-10-20');
  const bottom = page.locator('.bottom-bar');
  await bottom.getByRole('button', { name: 'Listas', exact: true }).click();
  const sidebar = page.locator('.sidebar');
  await expect(sidebar).toHaveAttribute('data-mobile-section', 'lists');
  await expect(sidebar.locator('a[href="/filters"]').first()).toBeVisible();
  await expect(page.locator('.calendar-sidebar')).toHaveCount(0);
  await expect(sidebar.locator('.mobile-more-grid')).toHaveCount(0);
  await bottom.getByRole('button', { name: 'Más', exact: true }).click();
  await expect(sidebar).toHaveAttribute('data-mobile-section', 'more');
  await expect(sidebar.locator('.mobile-more-grid')).toBeVisible();
  await sidebar.getByRole('link', { name: 'Filtros', exact: true }).click();
  await expect(page).toHaveURL(/\/filters$/);
  await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'closed');
  await bottom.getByRole('button', { name: 'Más', exact: true }).click();
  await expect(sidebar.locator('.mobile-more-grid')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'closed');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/calendar/month?date=2026-10-20');
  await expect(page.locator('.calendar-sidebar')).toHaveCount(1);
  await expect(page.locator('.sidebar')).not.toHaveAttribute('data-mobile-section');
});

test('RF-1101 desktop agenda header keeps only filters and view icons', async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/calendar/agenda');
  const toolbar = page.locator('.calendar-toolbar');
  await expect(toolbar.getByRole('button')).toHaveCount(3);
  await expect(toolbar.locator('.calendar-period, .calendar-nav, .calendar-add')).toHaveCount(0);
  await toolbar.getByRole('button', { name: 'Calendario', exact: true }).click();
  await expect(page.locator('.calendar-mobile-navigation')).toHaveCount(0);
  await expect(page.locator('.calendar-view-links')).toBeVisible();
});

test('RF-1101 agenda loads December and keeps navigation across empty months', async ({ page }) => {
  await fixture(page);
  await page.route('**/api/v1/calendar/events?*', async (route) => {
    const to = new URL(route.request().url()).searchParams.get('to') ?? '';
    await route.fulfill({
      json: {
        tasks: [],
        external:
          to > '2026-12-15'
            ? [
                {
                  id: 'december-event',
                  title: 'Evento de diciembre',
                  starts_at: '2026-12-15T10:00:00+01:00',
                  ends_at: '2026-12-15T11:00:00+01:00',
                  is_all_day: false,
                  time_zone: 'Europe/Madrid',
                  color: '#5588aa',
                },
              ]
            : [],
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/agenda');
  const timeline = page.locator('.calendar-agenda-timeline');
  async function nextMonth() {
    await timeline.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await timeline.getByRole('button', { name: 'Ver mes siguiente' }).click();
  }
  await expect(timeline.locator('[data-agenda-month="2026-11"]')).toHaveCount(1);
  await nextMonth();
  await expect(timeline.getByText('Evento de diciembre', { exact: true })).toBeVisible();
  await expect(timeline.locator('[data-agenda-month="2026-12"]')).toBeInViewport();
  await nextMonth();
  await expect(timeline.locator('[data-agenda-month="2027-01"]')).toBeInViewport();
  await nextMonth();
  await expect(timeline.locator('[data-agenda-month="2027-02"]')).toBeInViewport();
});

for (const width of [390, 1280]) {
  test(`RF-1101 calendar action positions stay consistent across views ${width}`, async ({
    page,
  }) => {
    await fixture(page);
    await page.setViewportSize({ width, height: 844 });
    let reference: { filterX: number; viewX: number } | undefined;
    for (const view of views) {
      await page.goto(`/calendar/${view}?date=2026-10-20`);
      const filter = page.locator('.calendar-filter-menu > button');
      const selector = page.locator('.calendar-mobile-views > button');
      await expect(filter).toBeVisible();
      await expect(selector).toBeVisible();
      const filterBox = (await filter.boundingBox())!;
      const viewBox = (await selector.boundingBox())!;
      expect(filterBox.x).toBeLessThan(viewBox.x);
      if (reference) {
        expect(Math.abs(filterBox.x - reference.filterX)).toBeLessThan(2);
        expect(Math.abs(viewBox.x - reference.viewX)).toBeLessThan(2);
      } else reference = { filterX: filterBox.x, viewX: viewBox.x };
      const order = await page
        .locator('.calendar-toolbar')
        .evaluate((node) =>
          [...node.querySelectorAll('button')]
            .filter((button) => button.closest('.calendar-filter-menu, .calendar-mobile-views'))
            .map((button) => button.parentElement!.className),
        );
      expect(order).toEqual(['calendar-filter-menu', 'calendar-mobile-views']);
    }
  });
}

test('RF-1103 calendar filters show subscription empty state without settings navigation', async ({
  page,
}) => {
  await fixture(page);
  await page.route('**/api/v1/calendar/subscriptions', (route) =>
    route.fulfill({ json: { items: [], next_cursor: null } }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/agenda');
  await page.getByRole('button', { name: 'Filtrar calendario', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Filtrar calendario' });
  await expect(panel.getByText('No hay calendarios suscritos', { exact: true })).toBeVisible();
  await expect(panel.locator('a[href="/settings/calendar"]')).toHaveCount(0);
  await expect(
    panel.getByRole('group', { name: 'Calendario', exact: true }).getByRole('checkbox'),
  ).toHaveCount(0);
  await expect(panel.getByLabel('Tareas', { exact: true })).toBeChecked();
});

test('RF-1101 day week strip selects dates and swipes weeks keeping the selected weekday', async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/day');
  const strip = page.locator('.calendar-day-week-strip');
  await expect(strip.getByRole('button')).toHaveCount(7);
  await expect(strip.locator('[aria-pressed="true"]')).toHaveText(/20/);
  await expect(strip.locator('[aria-current="date"]')).toHaveAttribute('aria-pressed', 'true');
  await strip
    .getByRole('button', { name: 'miércoles, 21 de octubre de 2026', exact: true })
    .click();
  await expect(page).toHaveURL(/date=2026-10-21/);
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  async function swipe(direction: number) {
    const box = (await strip.boundingBox())!;
    const x = box.x + box.width / 2 - direction * 70;
    const y = box.y + box.height / 2;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 4; step++)
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + (direction * 140 * step) / 4, y }],
      });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await swipe(-1);
  await expect(page).toHaveURL(/date=2026-10-28/);
  await expect(strip.getByRole('button').nth(2)).toHaveAttribute('aria-pressed', 'true');
  await swipe(1);
  await expect(page).toHaveURL(/date=2026-10-21/);
  const before = (await strip.boundingBox())!;
  await page.locator('.hour-board').evaluate((node) => {
    node.scrollTop = 600;
  });
  expect((await strip.boundingBox())!.y).toBe(before.y);
  await page.goto('/calendar/day?date=2026-12-30');
  await expect(strip.getByRole('button').nth(2)).toHaveAttribute('aria-pressed', 'true');
  await swipe(-1);
  await expect(page).toHaveURL(/date=2027-01-06/);
  await expect(strip.getByRole('button').nth(2)).toHaveAttribute('aria-pressed', 'true');
  await strip.focus();
  await page.keyboard.press('PageUp');
  await expect(page).toHaveURL(/date=2026-12-30/);
  await page.screenshot({ path: '/tmp/calendar-day-week-strip-390.png' });
});

test.describe('Day current time in account timezone', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('RF-1101 red current-time line updates and compact header leaves room for the timeline', async ({
    page,
  }) => {
    await fixture(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/calendar/day?date=2026-10-20');
    const line = page.locator('.hour-now');
    await expect(line).toBeVisible();
    await expect(line).toHaveCSS('background-color', 'rgb(224, 49, 49)');
    await expect
      .poll(() => line.evaluate((node) => parseFloat((node as HTMLElement).style.top)))
      .toBe(576);
    await expect(line).toBeInViewport();
    const grid = await page.locator('.hour-board').boundingBox();
    expect(grid!.y).toBeLessThan(844 * 0.22);
    expect(grid!.height).toBeGreaterThan(844 * 0.65);
    await page.screenshot({ path: '/tmp/calendar-day-compact-now-390.png' });
    await page.clock.runFor(60_000);
    await expect
      .poll(() => line.evaluate((node) => parseFloat((node as HTMLElement).style.top)))
      .toBeCloseTo(576.8, 1);
    await page.goto('/calendar/day?date=2026-10-21');
    await expect(page.locator('.hour-now')).toHaveCount(0);
  });
});

test('RF-1101 four all-day tasks keep the day header compact and separated from its label', async ({
  page,
}) => {
  await fixture(page, { count: 4, allDayEvents: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/day?date=2026-10-20');
  const row = page.locator('.hour-allday');
  await expect(row.getByRole('checkbox')).toHaveCount(2);
  await expect(row.locator('.hour-allday-more')).toHaveText('+3');
  const moreBox = (await row.locator('.hour-allday-more').boundingBox())!;
  const taskBoxes = await row.locator('.calendar-cell-task').evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
    }),
  );
  expect(moreBox.x).toBeGreaterThanOrEqual(taskBoxes[0]!.right);
  expect(moreBox.y).toBeLessThanOrEqual(taskBoxes[0]!.y);
  expect(moreBox.y + moreBox.height).toBeLessThanOrEqual(taskBoxes[1]!.bottom + 1);

  const label = (await row.locator('.hour-allday-label').boundingBox())!;
  const first = (await row.locator('.calendar-cell-task').first().boundingBox())!;
  expect(first.x - label.x - label.width).toBeGreaterThanOrEqual(0);
  await expect(page.locator('.hour-now')).toHaveCSS('height', '1px');
  await page.screenshot({ path: '/tmp/calendar-day-four-allday-compact-390.png' });
  await row.locator('.hour-allday-more').click();
  const dialog = page.locator('.calendar-day-sheet');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox')).toHaveCount(4);
  await expect(dialog.getByText('Evento de tres días', { exact: true })).toBeVisible();
});

test('RF-1101 23:00 task keeps time and title readable within its hour', async ({ page }) => {
  await fixture(page, { lateTask: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/day?date=2026-10-20');
  await page.locator('.hour-board').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  const task = page.locator('.calendar-hour-task');
  await expect(task.locator('small')).toHaveCount(0);
  await expect(page.locator('.hour-block small')).toHaveCount(0);
  await expect(task.getByRole('link')).toContainText('Revisando la app ticktackdone');
  await expect(task).toBeInViewport();
  const box = (await task.boundingBox())!;
  const col = (await page.locator('.hour-col').boundingBox())!;
  expect(box.height).toBeLessThan(48);
  expect(box.y + box.height).toBeLessThanOrEqual(col.y + col.height + 1);
  await page.screenshot({ path: '/tmp/calendar-day-task-23-390.png' });
});

test('RF-1101 quarter and two weeks stay desktop-only', async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/month?date=2026-10-20');
  await page.locator('.calendar-mobile-views > button').click();
  await expect(page.locator('.mobile-view-links a[href*="/quarter"]')).toHaveCount(0);
  await expect(page.locator('.mobile-view-links a[href*="/two-weeks"]')).toHaveCount(0);
  await page.goto('/calendar/quarter?date=2026-10-20&tag_id=tag');
  await expect(page).toHaveURL(/calendar\/month\?date=2026-10-20&tag_id=tag/);
  await page.goto('/calendar/two-weeks?date=2026-10-20');
  await expect(page).toHaveURL(/calendar\/week\?date=2026-10-20/);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/calendar/quarter?date=2026-10-20');
  await expect(page.locator('.year-card')).toHaveCount(3);
  await page.locator('.calendar-mobile-views > button').click();
  await expect(page.locator('.mobile-view-links a[href*="/quarter"]')).toBeVisible();
  await expect(page.locator('.mobile-view-links a[href*="/two-weeks"]')).toBeVisible();
  await page.goto('/calendar/two-weeks?date=2026-10-20');
  await expect(page.locator('.cal-cell')).toHaveCount(14);
});

test('RF-1902 mobile view picker dims and blurs the background and closes on outside tap', async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/day');
  const trigger = page.locator('.calendar-mobile-views > button');
  await trigger.click();
  const backdrop = page.locator('.calendar-views-backdrop');
  await expect(backdrop).toBeVisible();
  await expect(backdrop).toHaveCSS('backdrop-filter', 'blur(4px)');
  await expect(page.locator('.calendar-view-links')).toBeVisible();
  await page.screenshot({ path: '/tmp/calendar-views-backdrop-mobile.png' });
  await backdrop.click({ position: { x: 10, y: 600 } });
  await expect(backdrop).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 800 });
  await trigger.click();
  await expect(backdrop).toBeHidden();
});

test('RF-1101 mobile week uses compact single-line task and event cards', async ({ page }) => {
  await fixture(page, { count: 12 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/week?date=2026-10-20');
  const chips = page.locator('.mobile-week-chip');
  await expect(chips).toHaveCount(12);
  const first = chips.first();
  expect((await first.boundingBox())!.height).toBeLessThanOrEqual(24);
  await expect(first.getByRole('link')).toHaveCSS('font-weight', '400');
  await expect(first.locator('.task-check-svg')).toHaveCSS('width', '13px');
  const items = page.locator('.mobile-week-items').filter({ has: first });
  expect(
    await items.evaluate(
      (node) =>
        [...node.children].filter(
          (child) => child.getBoundingClientRect().bottom <= node.getBoundingClientRect().bottom,
        ).length,
    ),
  ).toBeGreaterThanOrEqual(4);
  await page.screenshot({ path: '/tmp/calendar-week-compact-cards-390.png' });
});

test('RF-1101 mobile workweek reuses weekend space for the five weekdays', async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/week?date=2026-10-20');
  const board = page.locator('.mobile-week-board');
  await expect(board.locator('.mobile-week-day')).toHaveCount(7);
  const original = (await board.locator('.mobile-week-day').first().boundingBox())!;
  await page.getByRole('button', { name: 'Filtrar calendario', exact: true }).click();
  await page.getByLabel('Solo semana laboral (L–V)').check();
  await page.keyboard.press('Escape');
  await expect(board.locator('.mobile-week-day')).toHaveCount(5);
  const first = (await board.locator('.mobile-week-day').first().boundingBox())!;
  expect(first.height).toBeGreaterThan(original.height * 1.25);
  const bounds = (await board.boundingBox())!;
  const last = (await board.locator('.mobile-week-day').last().boundingBox())!;
  expect(Math.abs(last.y + last.height - bounds.y - bounds.height)).toBeLessThan(2);
});

test('75.2/75.9 fixed task pane belongs only to Tasks and other sections open a floating detail', async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const path of [
    '/calendar/month?date=2026-10-20',
    '/focus',
    '/matrix',
    '/search',
    '/statistics',
  ]) {
    await page.goto(path);
    await expect(page.locator('.shell')).toHaveAttribute('data-detail', 'closed');
    await expect(page.locator('.shell > .detail-slot')).toHaveCount(0);
    await expect(page.locator('.detail-empty')).toHaveCount(0);
    await page.goto(`${path}${path.includes('?') ? '&' : '?'}task=task`);
    const detail = page.getByRole('dialog', { name: 'Tarea', exact: true });
    await expect(detail).toBeVisible();
    await expect(detail.locator('.detail-title')).toHaveValue(/Tarea sintética/);
    await expect(page.locator('.shell')).toHaveAttribute('data-detail', 'closed');
    await expect(page.locator('.shell > .detail-slot')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
    await expect(page).not.toHaveURL(/task=task/);
  }
  await page.goto('/today');
  await expect(page.locator('.shell')).toHaveAttribute('data-detail', 'open');
  await expect(page.locator('.detail-empty')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/month?date=2026-10-20&task=task');
  await expect(page.locator('.shell > .detail-slot .detail-title')).toHaveValue(/Tarea sintética/);
  await expect(page.locator('.task-detail-dialog')).toHaveCount(0);
  await page.locator('.detail-close').click();
  await expect(page.locator('.shell > .detail-slot')).toHaveCount(0);
});

for (const width of [1280, 390]) {
  test(`75.3 header fold button controls the sidebar consistently at ${width}`, async ({
    page,
  }) => {
    await fixture(page);
    await page.setViewportSize({ width, height: 844 });
    for (const path of [
      '/calendar/month?date=2026-10-20',
      '/calendar/agenda',
      '/today',
      '/inbox',
    ]) {
      await page.goto(path);
      const fold = page.locator('.sidebar-fold-button');
      await expect(fold).toHaveCount(1);
      await expect(fold).toHaveAttribute('aria-controls', 'section-sidebar');
      await expect(page.locator('.rail-toggle')).toHaveCount(0);
      if (path.startsWith('/calendar/month')) await page.screenshot({ path: `/tmp/ttd-fold-${width}.png` });
      const expanded = await fold.getAttribute('aria-expanded');
      await fold.click();
      await expect(fold).toHaveAttribute('aria-expanded', expanded === 'true' ? 'false' : 'true');
      if (width < 700) {
        await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'open');
        await expect(page.locator('#section-sidebar')).toBeVisible();
        await expect(page.locator('#section-sidebar')).toHaveAttribute(
          'data-mobile-section',
          'lists',
        );
        await page.keyboard.press('Escape');
        await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'closed');
      } else {
        await fold.click();
        await fold.focus();
        await page.keyboard.press('[');
        await expect(fold).toHaveAttribute('aria-expanded', expanded === 'true' ? 'false' : 'true');
        await page.keyboard.press('[');
      }
    }
  });
}
