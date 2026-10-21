import { test, expect, type Page } from '@playwright/test';

const day = '2026-10-20';
function habit(id: string, name: string, target: number, count: number, frequency = ['tuesday']) {
  return {
    id,
    name,
    icon: null,
    color: null,
    archived: false,
    frequency,
    reminder_time: '09:30',
    sort_order: '1',
    goal: { times_per_period: target, period: 'day', target_count: target },
    today: { date: day, count, met: count >= target, note: null },
    created_at: day,
    updated_at: day,
  };
}
async function setup(page: Page, theme = 'light') {
  const state = {
    habits: [] as ReturnType<typeof habit>[],
    capacity: 390 as number | null,
    minutes: 150,
    unestimated: 3,
    load: 'ok',
    checks: [] as Record<string, unknown>[],
  };
  let release = () => {};
  await page.clock.install({ time: new Date(`${day}T10:00:00Z`) });
  await page.addInitScript((theme) => {
    localStorage.setItem('tick-tack-done.account-prefs', '1');
    localStorage.setItem('tick-tack-done.locale', 'es');
    localStorage.setItem('tick-tack-done.theme', theme);
  }, theme);
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let body: unknown = { items: [], next_cursor: null };
    if (path === '/auth/session' || path === '/me')
      body = {
        id: 'test',
        display_name: 'Prueba',
        email: 'test@example.test',
        csrf_token: 'test',
        time_zone: 'Europe/Madrid',
        locale: 'es',
        theme,
        features: { day_load: true, day_closing: true, day_replan: true },
      };
    if (path === '/projects')
      body = {
        items: [{ id: 'inbox', name: 'Bandeja', is_inbox: true, closed: false, kind: 'TASK' }],
        next_cursor: null,
      };
    if (path === '/planning/load') {
      if (state.load === 'pending')
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      if (state.load === 'error') {
        await route.fulfill({ status: 500, json: { error: 'failed' } });
        return;
      }
      body = {
        task_minutes: state.minutes,
        available_minutes: state.capacity,
        unestimated_count: state.unestimated,
        status: 'ok',
      };
    }
    if (path === '/habits') body = { items: state.habits, next_cursor: null };
    if (path.endsWith('/checkins')) {
      const data = route.request().postDataJSON() as Record<string, unknown>;
      state.checks.push(data);
      const item = state.habits.find((h) => h.id === path.split('/')[2])!;
      item.today.count = Number(data.count);
      item.today.met = item.today.count >= item.goal.target_count;
      body = { id: 'log', habit_id: item.id, date: day, count: item.today.count, note: null };
    }
    await route.fulfill({ json: body });
  });
  return { state, release: () => release() };
}

for (const width of [1280, 390])
  for (const theme of ['light', 'dark']) {
    test(`RF-1301/1302/2642: Today plan and habit rows ${width} ${theme}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const { state } = await setup(page, theme);
      await page.goto('/today?group=priority');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const plan = page.getByRole('region', { name: 'Plan del día', exact: true });
      await expect(plan.getByText('2 h 30 min de 6 h 30 min')).toBeVisible();
      await expect(plan.getByText('3 tareas sin duración')).toBeVisible();
      await expect(page.locator('.today-plan-card')).toHaveCount(0);
      await expect(
        plan.getByRole('link', { name: 'Planificar mi día', exact: true }),
      ).toHaveAttribute('href', '/plan/day');
      await expect(plan.getByRole('link', { name: 'Replanificar', exact: true })).toHaveCount(0);
      await expect(plan.getByRole('link', { name: 'Cerrar el día', exact: true })).toHaveCount(0);
      if (width === 1280) expect((await plan.boundingBox())!.height).toBeLessThan(66);
      await expect(
        page.getByRole('link', { name: 'Añadir un hábito', exact: true }),
      ).toHaveAttribute('href', '/habits');
      await expect(page.getByText('Hoy no tienes hábitos')).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({ path: info.outputPath(`today-empty-${width}-${theme}.png`) });
      state.habits = [
        habit('water', 'Beber agua', 8, 2),
        habit('read', 'Leer', 1, 1),
        habit('off', 'Sólo el miércoles', 1, 0, ['wednesday']),
      ];
      await page.reload();
      const group = page.locator('.today-habits');
      await expect(group.locator('summary')).toContainText('1/2 hoy');
      await expect(group.getByRole('link', { name: 'Sólo el miércoles', exact: true })).toHaveCount(
        0,
      );
      await expect(group.getByRole('link', { name: 'Leer', exact: true })).toHaveCSS(
        'text-decoration-line',
        'line-through',
      );
      await expect(group.getByText('2/8', { exact: true })).toBeVisible();
      expect(
        (await group.locator('.today-habit-row').first().boundingBox())!.height,
      ).toBeLessThanOrEqual(width === 390 ? 60 : 48);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      const rowRect = await group.locator('.today-habit-row').first().boundingBox();
      const metaRect = await group.locator('.task-meta').first().boundingBox();
      expect(Math.abs(rowRect!.x + rowRect!.width - metaRect!.x - metaRect!.width)).toBeLessThan(
        18,
      );
      await page.screenshot({ path: info.outputPath(`today-data-${width}-${theme}.png`) });
      await group.getByRole('button', { name: 'Registrar «Beber agua»', exact: true }).click();
      await expect(group.getByText('3/8', { exact: true })).toBeVisible();
      expect(state.checks[0]).toEqual({ date: day, count: 3 });
      await group.locator('summary').click();
      await expect(group).not.toHaveAttribute('open');
      await page.reload();
      await expect(page.locator('.today-habits')).not.toHaveAttribute('open');
    });
  }

test('RF-1301: empty dismissal keeps seven day storage; existing unscheduled habits are distinct', async ({
  page,
}) => {
  const { state } = await setup(page);
  await page.goto('/today');
  await page.getByRole('button', { name: 'Ocultar', exact: true }).click();
  await expect(page.locator('.today-habits')).toHaveCount(0);
  const at = await page.evaluate(() =>
    Number(localStorage.getItem('tick-tack-done.habits.dismissed')),
  );
  expect(Math.abs(at - new Date(`${day}T10:00:00Z`).getTime())).toBeLessThan(5000);
  await page.reload();
  await expect(page.locator('.today-habits')).toHaveCount(0);
  await page.clock.fastForward(7 * 24 * 60 * 60 * 1000 + 60000);
  await expect(page.getByRole('link', { name: 'Añadir un hábito', exact: true })).toBeVisible();
  state.habits = [habit('off', 'Sólo miércoles', 1, 0, ['wednesday'])];
  await page.reload();
  await expect(page.getByText('Hoy no hay hábitos programados', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Añadir un hábito', exact: true })).toHaveCount(0);
  await expect(page.locator('.today-habits .task-count')).toHaveCount(0);
});

test('RF-2642: neutral loading/error and real alternate capacity without unknown estimates', async ({
  page,
}) => {
  const { state, release } = await setup(page);
  state.load = 'pending';
  await page.goto('/today');
  const plan = page.getByRole('region', { name: 'Plan del día', exact: true });
  await expect(plan.getByRole('status')).toHaveText('Calculando carga…');
  await expect(plan.locator('.today-plan-load')).toHaveCount(0);
  await expect(plan.locator('.today-plan-warning')).toHaveCount(0);
  state.load = 'ok';
  state.capacity = 240;
  state.minutes = 45;
  state.unestimated = 0;
  release();
  await expect(plan.getByText('45 min de 4 h')).toBeVisible();
  await expect(plan.locator('.today-plan-warning')).toHaveCount(0);
  state.load = 'error';
  await page.reload();
  await page.clock.fastForward(15000);
  await expect(plan.getByRole('status')).toHaveCount(0);
  await expect(plan.locator('.today-plan-load')).toHaveCount(0);
  await expect(plan.locator('.today-plan-warning')).toHaveCount(0);
  await expect(plan.getByRole('link', { name: 'Planificar mi día' })).toBeVisible();
});
