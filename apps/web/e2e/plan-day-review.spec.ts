import { expect, test, type Page } from '@playwright/test';
async function fixture(page: Page, state = 'ready') {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  let revision = 1;
  const decisions: { task_id: string; decision: string; target_date: string | null }[] = [];
  const cards =
    state === 'empty'
      ? []
      : [
          {
            task_id: 'one',
            title:
              'Preparar una propuesta con un título largo para comprobar el espacio que ocupa cada fila',
            section: 'today',
            project_id: 'work',
            project_name: 'Trabajo',
            reason_text: 'Vence hoy',
            recurring: false,
          },
          {
            task_id: 'repeat',
            title: 'Revisión diaria recurrente',
            section: 'today',
            project_id: 'work',
            project_name: 'Trabajo',
            reason_text: 'Vence hoy',
            recurring: true,
          },
          {
            task_id: 'old',
            title: 'Vencida de otra semana',
            section: 'overdue',
            project_id: 'work',
            project_name: 'Trabajo',
            reason_text: 'Venció hace días',
            recurring: false,
          },
        ];
  const session = () => ({
    id: 'plan',
    local_date: '2026-10-20',
    revision,
    state: 'draft',
    hidden_overdue: 0,
    cards,
    decisions,
    preview: {
      effects: decisions.map((d) => ({
        task_id: d.task_id,
        summary:
          d.decision === 'later'
            ? 'En el plan de mañana, sin cambiar vencimiento'
            : 'Se completará',
      })),
    },
  });
  await page.clock.install({ time: new Date('2026-10-20T10:00:00Z') });
  await page.addInitScript(() => {
    localStorage.setItem('tick-tack-done.account-prefs', '1');
    localStorage.setItem('tick-tack-done.locale', 'es');
  });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/auth/session' || path === '/me') {
      await route.fulfill({
        json: {
          id: 'user',
          email: 'test@example.test',
          csrf_token: 'test',
          display_name: 'Prueba',
          time_zone: 'Europe/Madrid',
          locale: 'es',
          features: {},
        },
      });
      return;
    }
    if (path === '/planning/sessions') {
      calls.push({ path, body: route.request().postDataJSON() as Record<string, unknown> });
      if (state === 'loading') await new Promise((resolve) => setTimeout(resolve, 10000));
      if (state === 'error') {
        await route.fulfill({
          status: 500,
          json: { error: { code: 'failed', message: 'No se pudo preparar el plan' } },
        });
        return;
      }
      await route.fulfill({ json: session() });
      return;
    }
    if (path.includes('/decisions/')) {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      calls.push({ path, body });
      const id = path.split('/').at(-1) ?? '';
      const index = decisions.findIndex((d) => d.task_id === id);
      if (index >= 0) decisions.splice(index, 1);
      decisions.push({
        task_id: id,
        decision: String(body.decision),
        target_date: typeof body.target_date === 'string' ? body.target_date : null,
      });
      revision++;
      await route.fulfill({ json: session() });
      return;
    }
    if (path.endsWith('/apply')) {
      calls.push({ path, body: route.request().postDataJSON() as Record<string, unknown> });
      await route.fulfill({
        json: { applied: decisions.map((d) => ({ ...d, effect: 'planned_later' })) },
      });
      return;
    }
    if (path === '/planning/load') {
      await route.fulfill({ json: { task_minutes: 90, available_minutes: 360, status: 'ok' } });
      return;
    }
    await route.fulfill({ json: { items: [], next_cursor: null } });
  });
  return calls;
}
for (const width of [1280, 390]) {
  test(`RF-2301: compact daily review and explicit confirmation ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 850 });
    const calls = await fixture(page);
    await page.goto('/plan/day');
    await expect(page.getByRole('heading', { name: 'Plan del día' })).toBeVisible();
    await expect(page.getByText('Vencida de otra semana')).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: /Revisión diaria recurrente/ })).toBeDisabled();
    expect(calls[0]?.body).toMatchObject({
      today: true,
      overdue: false,
      inbox: false,
      undated: false,
    });
    const check = page.getByRole('checkbox', { name: /Preparar una propuesta/ });
    await check.check();
    expect(calls.filter((c) => c.path.includes('/decisions/'))).toHaveLength(0);
    await page.screenshot({ path: info.outputPath(`plan-day-${width}.png`), fullPage: true });
    const row = await page.locator('.plan-task-list>li').first().boundingBox();
    expect(row?.height).toBeLessThanOrEqual(80);
    await page
      .locator('.weekly-actions')
      .getByRole('button', { name: 'Mañana', exact: true })
      .click();
    expect(calls.find((c) => c.path.includes('/decisions/'))?.body).toEqual({
      decision: 'later',
      target_date: '2026-10-21',
    });
    expect(calls.some((c) => c.path.endsWith('/apply'))).toBe(false);
    await expect(page.getByText('En el plan de mañana, sin cambiar vencimiento')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`plan-preview-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Confirmar plan', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Plan aplicado' })).toBeVisible();
    expect(calls.filter((c) => c.path.endsWith('/apply'))).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
  for (const state of ['empty', 'loading', 'error'])
    test(`daily plan ${state} ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 850 });
      await fixture(page, state);
      await page.goto('/plan/day');
      await expect(
        page.getByText(
          state === 'empty'
            ? 'No hay tareas para hoy.'
            : state === 'loading'
              ? 'Preparando el plan…'
              : 'No se pudo preparar el plan',
          { exact: false },
        ),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`plan-${state}-${width}.png`),
        fullPage: true,
      });
    });
}
