import { expect, test, type Page } from '@playwright/test';
test.use({ timezoneId: 'Europe/Madrid' });
const views = ['day', 'week', 'month', 'agenda', 'year', 'quarter', 'multi-week', 'multi-day'];
async function fixture(page: Page) {
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
    color: '#4772fa',
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
            title: 'Tarea de todo el día',
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
          path: `../../docs/reviews/assets/calendar-2026-10-21/${view}-${width}-${theme}.png`,
        });
      }
    });
  }

test('RF-1101: native period picker and complete mobile day sheet keep the selected date', async ({
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
  await page.locator('.calendar-period>summary').click();
  await page.getByLabel('Fecha', { exact: true }).fill('2026-11-03');
  await expect(page).toHaveURL(/date=2026-11-03/);
  await page.locator('.calendar-mobile-view').selectOption('day');
  await expect(page.locator('.calendar-period h1')).toContainText('3 de noviembre');
  await page.locator('.calendar-nav').getByRole('button', { name: 'Hoy', exact: true }).click();
  await expect(page).toHaveURL(/date=2026-10-20/);
});
