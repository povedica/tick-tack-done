import { expect, test, type Page } from '@playwright/test';

async function fixture(page: Page, state = 'ready', mutations: string[] = []) {
  await page.addInitScript(() => {
    localStorage.setItem('tick-tack-done.account-prefs', '1');
    localStorage.setItem('tick-tack-done.locale', 'es');
  });
  await page.clock.install({ time: new Date('2026-10-20T14:30:00Z') });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/tasks/') && route.request().method() !== 'GET') {
      mutations.push(path);
      await route.fulfill({ json: { id: 'one', title: 'Updated task', status: 'active' } });
      return;
    }
    if (path.endsWith('/dashboard/data')) {
      await route.fulfill({ json: { widgets: { overdue: 58 } } });
      return;
    }
    if (path.endsWith('/auth/session') || path.endsWith('/me')) {
      await route.fulfill({
        json: {
          id: 'test',
          email: 'test@example.test',
          display_name: 'Prueba',
          csrf_token: 'test',
          locale: 'es',
          time_zone: 'Europe/Madrid',
          features: {},
        },
      });
      return;
    }
    if (/\/reports\/weekly\/\d{4}-\d{2}-\d{2}$/.test(path)) {
      await route.fulfill({
        status: 404,
        json: { error: { code: 'report_not_found', message: 'Not found' } },
      });
      return;
    }
    if (path.includes('/reports/weekly') || path.includes('/review/weekly')) {
      if (state === 'loading') {
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
      if (state === 'error') {
        await route.fulfill({ status: 500, json: { error: 'failed' } });
        return;
      }
      if (path.includes('/reports/weekly')) {
        await route.fulfill({
          json: {
            items:
              state === 'empty'
                ? []
                : [
                    {
                      week: '2026-10-19',
                      payload: {
                        completed: 211,
                        created: 303,
                        focus_minutes: 0.2,
                        habits_done: 0,
                        habits_expected: 0,
                        overdue: 58,
                        days: Array.from({ length: 7 }, (_, i) => ({
                          date: `2026-10-${19 + i}`,
                          completed: i === 0 ? 1 : 0,
                          created: 0,
                        })),
                      },
                    },
                  ],
          },
        });
        return;
      }
      await route.fulfill({
        json: {
          overdue_ids: state === 'empty' ? [] : ['one', 'repeat'],
          undated_ids: [],
          tasks: [
            {
              id: 'one',
              title:
                'Preparar la propuesta con un título muy largo que nunca debe empujar los controles ni perder el contexto de la lista',
              listId: 'work',
              listName: 'Trabajo',
              dueDate: '2026-10-10T10:00:00Z',
              recurring: false,
            },
            {
              id: 'repeat',
              title: 'Revisar cada semana',
              listId: 'work',
              listName: 'Trabajo',
              recurring: true,
            },
          ],
          lists: [],
          habits: [],
        },
      });
      return;
    }
    await route.fulfill({ json: { items: [] } });
  });
}
for (const width of [1280, 390]) {
  test(`RF-2201 / RF-2302: weekly screens ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 });
    const mutations: string[] = [];
    await fixture(page, 'ready', mutations);
    await page.goto('/reports/weekly');
    await expect(page.getByRole('heading', { name: 'Tu semana' })).toBeVisible();
    await expect(page.locator('.week-main strong')).toHaveText('1');
    await expect(page.getByText('En curso', { exact: false })).toBeVisible();
    await expect(page.locator('.week-day').nth(2).locator('strong')).toHaveText('—');
    await page.screenshot({ path: info.outputPath(`reports-${width}.png`), fullPage: true });
    await page.locator('.week-chart').scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`reports-detail-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: /^Seleccionar semana:/ }).click();
    const calendar = page.getByRole('dialog', { name: 'Seleccionar semana' });
    await expect(calendar).toBeVisible();
    await expect(calendar.locator('button[aria-pressed=true]')).toHaveCount(7);
    await calendar.getByRole('button', { name: 'Mes anterior' }).click();
    await expect(calendar.getByText('septiembre de 2026', { exact: true })).toBeVisible();
    await calendar.getByRole('button', { name: 'Mes siguiente' }).click();
    await page.screenshot({ path: info.outputPath(`week-calendar-${width}.png`), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(calendar).not.toBeVisible();
    await expect(page.getByRole('button', { name: /^Seleccionar semana:/ })).toBeFocused();
    await page.getByRole('button', { name: 'Semana anterior', exact: true }).click();
    await expect(page).toHaveURL(/2026-10-12$/);
    await expect(page.getByText(/No hay datos de esta semana/)).toBeVisible();
    await page.getByRole('button', { name: /^Seleccionar semana:/ }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Esta semana', exact: true })
      .click();
    await expect(page).toHaveURL(/2026-10-19$/);
    await page.getByRole('button', { name: /^Seleccionar semana:/ }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'lunes, 12 de octubre de 2026', exact: true })
      .click();
    await expect(page).toHaveURL(/2026-10-12$/);
    await page.getByRole('button', { name: 'Semana siguiente', exact: true }).click();
    await expect(page).toHaveURL(/2026-10-19$/);
    await page.goto('/review/weekly');
    await page
      .getByRole('navigation', { name: 'Pasos de revisión' })
      .getByRole('button', { name: 'Vencidas', exact: true })
      .click();
    await expect(page.getByRole('checkbox', { name: /Revisar cada semana/ })).toBeDisabled();
    await page.getByRole('checkbox', { name: /Preparar la propuesta/ }).check();
    await page.clock.runFor(250);
    await expect(page.getByRole('button', { name: 'Listo', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`review-${width}.png`), fullPage: true });
    const button = await page.getByRole('button', { name: 'Listo', exact: true }).boundingBox();
    expect(button && button.y + button.height).toBeLessThan(width < 640 ? 790 : 850);
    await expect(page.getByRole('checkbox', { name: /Preparar la propuesta/ })).toHaveClass(
      'task-check',
    );
    if (width < 640) {
      const toolbar = await page.locator('.weekly-actions').boundingBox();
      expect(toolbar?.height).toBeLessThanOrEqual(64);
    }
    expect(mutations).toEqual([]);
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('1 tarea');
      void dialog.dismiss();
    });
    await page.getByRole('button', { name: 'Listo', exact: true }).click();
    expect(mutations).toEqual([]);
    await page.locator('.weekly-actions').getByRole('button', { name: 'Hoy', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: '1 tarea movida a Hoy' }),
    ).toBeVisible();
    expect(mutations).toEqual(['/api/v1/tasks/one']);
  });
  for (const state of ['empty', 'loading', 'error']) {
    test(`weekly ${state} ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 850 });
      await fixture(page, state);
      for (const screen of ['reports', 'review']) {
        await page.goto(`/${screen}/weekly`);
        if (screen === 'review')
          await page
            .getByRole('navigation', { name: 'Pasos de revisión' })
            .getByRole('button', { name: 'Vencidas', exact: true })
            .click();
        await expect(
          page.getByText(
            state === 'loading'
              ? /Cargando (reporte|revisión)/
              : state === 'error'
                ? 'No se pudo cargar.'
                : screen === 'reports'
                  ? /No hay datos de esta semana/
                  : 'No hay vencidas',
            { exact: false },
          ),
        ).toBeVisible({ timeout: 20000 });
        await page.screenshot({
          path: info.outputPath(`${screen}-${state}-${width}.png`),
          fullPage: true,
        });
      }
    });
  }
}

test('RF-2204: calendar navigation reads a saved report outside the initial history page', async ({
  page,
}) => {
  await fixture(page);
  await page.route('**/api/v1/reports/weekly/2025-01-06', (route) =>
    route.fulfill({
      json: {
        week: '2025-01-06',
        payload: {
          metrics_version: 2,
          completed: 4,
          created: 0,
          days: Array.from({ length: 7 }, (_, i) => ({
            date: `2025-01-${String(6 + i).padStart(2, '0')}`,
            completed: i === 0 ? 4 : 0,
            created: 0,
          })),
        },
      },
    }),
  );
  await page.goto('/reports/weekly/2025-01-06');
  await expect(page.locator('.week-main strong')).toHaveText('4');
  await expect(page.getByText('Semana cerrada', { exact: true })).toBeVisible();
  await expect(page.locator('.week-current')).toHaveCount(0);
  await page.getByRole('button', { name: /^Seleccionar semana:/ }).click();
  await expect(page.getByRole('dialog').getByText('enero de 2025', { exact: true })).toBeVisible();
});
