import { expect, test, type Page } from '@playwright/test';
test.use({ timezoneId: 'Europe/Madrid' });
const views = ['day', 'week', 'month', 'agenda', 'year', 'quarter', 'multi-week', 'multi-day'];
async function fixture(
  page: Page,
  options: {
    count?: number;
    delayed?: boolean;
    error?: boolean;
    startOnly?: boolean;
    bars?: number;
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
    tag_ids: [],
    checklist_progress: { completed: 0, total: 0 },
    duration_minutes: 60,
    completed_at: null,
    created_at: '2026-10-01T08:00:00Z',
    source: 'manual',
  };
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
            is_all_day: true,
            due_date: '2026-10-19T22:00:00Z',
          },
        ],
        next_cursor: null,
      };
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
    if (path === '/calendar/events') body = { external, tasks: [] };
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
    if (path === '/calendar/events' && options.count !== undefined)
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
        await expect(
          page.locator('.calendar-nav').getByRole('button', { name: 'Hoy', exact: true }),
        ).toBeVisible();
        await page.evaluate(
          (theme) => document.documentElement.setAttribute('data-theme', theme),
          theme,
        );
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        if (width < 700) expect(await page.locator('.calendar-mobile-view option').count()).toBe(8);
        if (view === 'week') {
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
        if (view === 'quarter') await expect(page.locator('.year-card')).toHaveCount(3);
        await page.screenshot({
          path: `../../docs/reviews/assets/calendar-remediation-2026-10-21/${view}-${width}-${theme}.png`,
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
  await page.locator('.calendar-mobile-view').selectOption('day');
  await expect(page.locator('.calendar-period h1')).toContainText('3 de noviembre');
  await page.locator('.calendar-nav').getByRole('button', { name: 'Hoy', exact: true }).click();
  await expect(page).toHaveURL(/date=2026-10-20/);
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
      path: `../../docs/reviews/assets/calendar-remediation-2026-10-21/density-${count}.png`,
    });
  });

test('RF-1902 menu dismissal, keyboard date jump, year URL and working weekends', async ({
  page,
}) => {
  await fixture(page);
  await page.goto('/calendar/year?date=2026-10-20');
  const more = page.getByRole('button', { name: 'Más', exact: true });
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
  await page.getByRole('button', { name: 'Opciones del calendario' }).click();
  await page.getByLabel('Solo semana laboral (L–V)').check();
  await page.keyboard.press('Escape');
  await expect(page.locator('.hour-col')).toHaveCount(1);
  await expect(page.locator('h1')).toContainText('26');
});

test('RF-1101 range selector, stable useful scroll and sticky hourly axis', async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/multi-week?date=2026-10-20');
  await page.getByLabel('Número de semanas').selectOption('4');
  await expect(page.locator('.cal-cell')).toHaveCount(28);
  await page.getByRole('button', { name: 'Periodo siguiente' }).click();
  await expect(page).toHaveURL(/date=2026-11-17/);
  await page.reload();
  await expect(page.getByLabel('Número de semanas')).toHaveValue('4');
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
  await expect(page.getByRole('button', { name: '00:00 Evento real a medianoche' })).toBeVisible();
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
      await expect(page.locator('h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `../../docs/reviews/assets/calendar-remediation-2026-10-21/${view}-${width}-zoom${zoom}.png`,
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
  await row.getByRole('checkbox').check();
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: 'Opciones del calendario' }).click();
  await page.getByRole('checkbox', { name: 'Tareas', exact: true }).uncheck();
  await page.keyboard.press('Escape');
  await expect(page.locator('.agenda-row input[type=checkbox]')).toHaveCount(0);
  await expect(page.locator('.agenda-row .calendar-event-mark')).toHaveCount(6);
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
    path: '../../docs/reviews/assets/calendar-remediation-2026-10-21/spanning-detail.png',
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
    path: '../../docs/reviews/assets/calendar-remediation-2026-10-21/mini-calendar-320.png',
  });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Opciones del calendario' }).click();
  await page.screenshot({
    path: '../../docs/reviews/assets/calendar-remediation-2026-10-21/options-320.png',
  });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-day="2026-10-20"] strong button').click();
  await expect(page.getByRole('dialog').locator('.agenda-row')).toHaveCount(30);
  await page.screenshot({
    path: '../../docs/reviews/assets/calendar-remediation-2026-10-21/day-sheet-390.png',
  });
  await page.getByRole('dialog').locator('.agenda-row').last().scrollIntoViewIfNeeded();
  await expect(page.getByRole('dialog').locator('.agenda-row').last()).toBeVisible();
  await page.screenshot({
    path: '../../docs/reviews/assets/calendar-remediation-2026-10-21/day-sheet-bottom-390.png',
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
