import { expect, test, type Page } from '@playwright/test';
async function fixtures(page: Page) {
  let habit = {
    id: 'habit',
    name: 'Agua sintética',
    icon: '💧',
    color: null,
    goal: { period: 'day', target_count: 8, times_per_period: 8 },
    frequency: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    reminder_time: '09:00',
    motivation_note: 'Conservar motivación',
    challenge_days: 100,
    archived: false,
    sort_order: '1',
    today: { date: '2026-10-20', count: 2, note: 'Nota de hoy', met: false },
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-20T10:00:00Z',
  };
  const logs = [
    { date: '2026-10-19', count: 8, note: 'Nota anterior' },
    { date: '2026-10-20', count: 2, note: 'Nota de hoy' },
  ];
  const calls: { path: string; body: unknown }[] = [];
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
    if (path === '/habits') body = { items: [habit], next_cursor: null };
    if (path === '/habits/habit') {
      if (route.request().method() === 'PATCH') {
        const patch = route.request().postDataJSON() as Partial<typeof habit>;
        calls.push({ path, body: patch });
        habit = { ...habit, ...patch };
      }
      body = habit;
    }
    if (path === '/habits/habit/checkins') {
      const patch = route.request().postDataJSON() as {
        date: string;
        count: number;
        note?: string | null;
      };
      calls.push({ path, body: patch });
      const existing = logs.find((log) => log.date === patch.date);
      if (existing) {
        existing.count = patch.count;
        existing.note = patch.note === undefined ? existing.note : (patch.note ?? '');
      }
      if (patch.date === habit.today.date)
        habit.today = {
          date: patch.date,
          count: patch.count,
          note: patch.note === undefined ? habit.today.note : (patch.note ?? ''),
          met: patch.count >= habit.goal.target_count,
        };
      body = {
        id: 'log',
        habit_id: 'habit',
        date: patch.date,
        count: patch.count,
        note: existing?.note ?? null,
        goal_met: false,
        streak_broken: false,
      };
    }
    if (path === '/habits/habit/stats') {
      const heatmap = Array.from({ length: 31 }, (_, i) => {
        const date = `2026-10-${String(i + 1).padStart(2, '0')}`;
        const log = logs.find((log) => log.date === date);
        return { date, count: log?.count ?? 0, scheduled: true, met: (log?.count ?? 0) >= 8 };
      });
      body = {
        streak_current: 1,
        streak_best: 1,
        completion_percent: { week: 50, month: 25 },
        heatmap,
        aggregate_heatmap: heatmap.map((cell) => ({
          date: cell.date,
          scheduled: 1,
          met: cell.met ? 1 : 0,
        })),
        total_checkins: logs.reduce((sum, log) => sum + log.count, 0),
        month_checkins: 10,
        completed_days: 1,
        logs,
      };
    }
    await route.fulfill({ json: body });
  });
  return calls;
}
for (const width of [1440, 390])
  for (const theme of ['light', 'dark']) {
    test(`RF-1301/1302 habit quantity, editor, archive and history ${width} ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const calls = await fixtures(page);
      await page.goto('/habits');
      await expect(page.getByRole('link', { name: 'Agua sintética' })).toBeVisible();
      await page
        .getByRole('button', { name: /Marcar.*20 oct|Check-in.*20 oct|Registrar.*20 oct/i })
        .click();
      await expect
        .poll(() => calls.filter((call) => call.path.endsWith('/checkins')).length)
        .toBe(1);
      expect(calls.at(-1)?.body).toMatchObject({ date: '2026-10-20', count: 3 });
      await page.locator('.habit-card-title summary').click();
      await page.getByRole('button', { name: 'Editar', exact: true }).click();
      await expect(page.getByLabel('Completar N días (opcional)')).toHaveValue('100');
      await expect(page.getByLabel('Nota de motivación')).toHaveValue('Conservar motivación');
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();
      await page.getByRole('link', { name: 'Agua sintética' }).click();
      await expect(page.getByText('Nota anterior', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: '2026-10-19 · 8', exact: true }).first().click();
      const form = page.getByRole('form', { name: 'Editar registro del día' });
      await expect(form.getByLabel('Nota (opcional)')).toHaveValue('Nota anterior');
      await form.getByLabel('Cantidad').fill('9');
      await form.getByLabel('Nota (opcional)').fill('Nota corregida');
      await form.getByRole('button', { name: 'Guardar', exact: true }).click();
      await expect(form).toHaveCount(0);
      await expect(
        page.locator('.habit-notes p').filter({ hasText: 'Nota corregida' }),
      ).toBeVisible();
      await page.locator('h1').scrollIntoViewIfNeeded();
      await page.evaluate(
        (theme) => document.documentElement.setAttribute('data-theme', theme),
        theme,
      );
      await page.screenshot({
        path: `../../docs/reviews/assets/habits-2026-10-21/${width}-${theme}.png`,
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      let confirmed = false;
      page.once('dialog', async (dialog) => {
        confirmed = true;
        expect(dialog.message()).toContain('registro de ese día');
        await dialog.accept();
      });
      await page.getByRole('button', { name: '2026-10-19 · 9', exact: true }).first().click();
      await page.getByRole('button', { name: 'Desmarcar', exact: true }).click();
      await expect.poll(() => confirmed).toBe(true);
      expect(calls.at(-1)?.body).toMatchObject({ date: '2026-10-19', count: 0, note: null });
      await page.getByRole('button', { name: 'Archivar', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Recuperar', exact: true })).toBeVisible();
    });
  }
