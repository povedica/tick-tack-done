import { expect, test, type Page } from '@playwright/test';
import { statisticsFixture as fixtures } from './statistics.fixture';

async function mock(page: Page, empty: boolean) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown = { items: [], next_cursor: null };
    if (path.endsWith('/auth/session'))
      body = {
        csrf_token: 'test-csrf',
        id: 'fixture',
        email: 'fixture@example.test',
        display_name: 'Pruebas',
      };
    else if (path.endsWith('/me'))
      body = {
        id: 'fixture',
        email: 'fixture@example.test',
        display_name: 'Pruebas',
        time_zone: 'Europe/Madrid',
        theme: 'light',
        locale: 'es',
        features: {},
      };
    else if (path.endsWith('/projects'))
      body = { items: [{ id: 'list', name: 'Trabajo de prueba' }], next_cursor: null };
    else if (path.endsWith('/tags'))
      body = { items: [{ id: 'tag', name: 'Personal de prueba' }], next_cursor: null };
    else if (path.includes('/stats/')) {
      const data = fixtures(
        empty,
        url.searchParams.get('from') ?? undefined,
        url.searchParams.get('to') ?? undefined,
      );
      const kind = path.split('/').pop() as 'overview' | 'tasks' | 'focus' | 'habits';
      body = data[kind] ?? {};
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}
for (const width of [1280, 390])
  for (const theme of ['light', 'dark'])
    for (const empty of [false, true])
      for (const tab of ['overview', 'tasks', 'focus', 'habits']) {
        test(`RF-2321–2324 visual ${width} ${theme} ${empty ? 'empty' : 'data'} ${tab}`, async ({
          page,
        }) => {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
          await page.emulateMedia({
            colorScheme: theme === 'dark' ? 'dark' : 'light',
            reducedMotion: 'reduce',
          });
          await page.addInitScript(
            ({ theme }) => {
              localStorage.setItem('tick-tack-done.theme', theme);
              localStorage.setItem('tick-tack-done.locale', 'es');
            },
            { theme },
          );
          await mock(page, empty);
          await page.goto(tab === 'overview' ? '/statistics' : `/statistics/${tab}`);
          await expect(
            page.getByRole('heading', { name: 'Estadísticas', exact: true }),
          ).toBeVisible();
          await expect(page.locator('[role=tabpanel]')).not.toHaveAttribute('aria-busy', 'true');
          await expect(page.locator('.stats-skeleton')).toHaveCount(0);
          if (tab === 'overview') {
            await expect
              .poll(() =>
                page
                  .locator('.stats-kpi-grid')
                  .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length),
              )
              .toBe(width === 390 ? 2 : 3);
            if (empty) {
              await expect(page.getByRole('button', { name: 'Hábitos cumplidos —' })).toBeVisible();
              await expect(page.locator('.stats-delta.is-down')).toHaveCount(0);
            } else
              await expect(page.locator('.stats-chart .recharts-surface').first()).toBeVisible();
          }
          if (empty && tab === 'tasks') await expect(page.getByText('Tarde 100 %')).toHaveCount(0);
          if (!empty && tab === 'focus')
            await expect(page.locator('.stats-timeline rect').first()).toBeVisible();
          await expect
            .poll(() =>
              page.locator('.stats-page').evaluate((el) => el.scrollWidth > el.clientWidth + 1),
            )
            .toBe(false);
          await page.screenshot({
            path: `test-results/statistics-${width}-${theme}-${empty ? 'empty' : 'data'}-${tab}.png`,
            fullPage: true,
          });
        });
      }
test('RF-2321 historical navigation, named filters, keyboard and local persistence', async ({
  page,
}) => {
  await mock(page, false);
  await page.goto('/statistics?range=week&from=2026-10-19&to=2026-10-25');
  await page.getByRole('button', { name: 'Período anterior', exact: true }).click();
  await expect(page).toHaveURL(/from=2026-10-12/);
  await page.goBack();
  await expect(page).toHaveURL(/from=2026-10-19/);
  await page.locator('.stats-filter-btn').click();
  await page.getByLabel('Trabajo de prueba', { exact: true }).click();
  await expect(page.getByLabel('Trabajo de prueba', { exact: true })).toBeChecked();
  await expect(page.locator('.stats-chips')).toContainText('Trabajo de prueba');
  await expect(page).toHaveURL(/list=list/);
  await page.getByRole('tab', { name: 'Resumen', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Tareas', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.reload();
  await expect(page).toHaveURL(/list=list/);
  await expect(page.locator('.stats-chips')).toContainText('Trabajo de prueba');
});
test('RF-2324 export downloads query data and RF-2321 primary rail precedes Search', async ({
  page,
}) => {
  await mock(page, false);
  await page.goto('/statistics');
  await expect(page.locator('.stats-kpi-grid')).toBeVisible();
  await expect(page.locator('.icon-rail > a[href^="/statistics"]')).toBeVisible();
  await expect(page.locator('.icon-rail > a[href="/dashboard"]')).toBeVisible();
  const targets = await page
    .locator('.icon-rail > a')
    .evaluateAll((links) => links.map((link) => new URL(link.href).pathname));
  expect(targets.indexOf('/statistics')).toBeLessThan(targets.indexOf('/search'));
  expect(targets.indexOf('/dashboard')).toBe(targets.indexOf('/statistics') + 1);
  await expect(page.locator('.sidebar nav a[href="/statistics"]')).toHaveCount(0);
  await page.getByLabel('Exportar', { exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/stats-.*csv/);
});

test('RF-2321/2322 F02: every tab renders each preset and preserves selected dates', async ({
  page,
}) => {
  await mock(page, false);
  await page.goto('/statistics');
  for (const range of ['Hoy', 'Semana', 'Mes', 'Año']) {
    await page.getByRole('button', { name: range, exact: true }).click();
    const from = new URL(page.url()).searchParams.get('from');
    for (const tab of ['Resumen', 'Tareas', 'Foco', 'Hábitos']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await expect(page.locator('[role=tabpanel]')).not.toHaveAttribute('aria-busy', 'true');
      await expect(page.locator('.stats-chart .recharts-surface').first()).toBeVisible();
      expect(new URL(page.url()).searchParams.get('from')).toBe(from);
    }
  }
});
