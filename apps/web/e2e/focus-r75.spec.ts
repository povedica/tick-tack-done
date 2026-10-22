import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`TTD-AUD-78: timer, pause, stopwatch and session presets at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.install({ time: new Date('2026-10-25T00:50:00Z') });
    let session: Record<string, unknown> | null = null;
    const starts: Record<string, unknown>[] = [];
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
      let body: unknown = { items: [], next_cursor: null };
      if (path === '/me' || path === '/auth/session')
        body = {
          id: 'user',
          email: 'test@example.test',
          display_name: 'Test',
          csrf_token: 'test',
          time_zone: 'Europe/Madrid',
          locale: 'es',
          features: {},
        };
      if (path === '/focus/settings') {
        expect(route.request().method()).toBe('GET');
        body = { pomodoroMinutes: 25 };
      }
      if (path === '/focus/stats')
        body = {
          today_pomodoros: 0,
          today_focus_seconds: 0,
          completed_pomodoros: 0,
          focus_seconds: 0,
        };
      if (path === '/focus/sessions') {
        if (route.request().method() === 'POST') {
          const input = route.request().postDataJSON() as Record<string, unknown>;
          starts.push(input);
          session = {
            id: 'session',
            type: input.type,
            planned_minutes: input.type === 'stopwatch' ? 0 : (input.planned_minutes ?? 25),
            started_at: await page.evaluate(() => new Date().toISOString()),
            ended_at: null,
            paused_at: null,
            paused_seconds: 0,
            remaining_seconds: 900,
            task_id: null,
          };
          body = session;
        } else body = { items: session ? [session] : [], next_cursor: null };
      }
      if (path.endsWith('/pause') && session) {
        session.paused_at = await page.evaluate(() => new Date().toISOString());
        body = session;
      }
      if (path.endsWith('/resume') && session) {
        session.paused_at = null;
        body = session;
      }
      if (path.endsWith('/finish') && session) {
        session.ended_at = await page.evaluate(() => new Date().toISOString());
        session.completed = true;
        session.actual_seconds = 60;
        body = session;
      }
      await route.fulfill({ status: route.request().method() === 'POST' ? 201 : 200, json: body });
    });
    await page.goto('/focus');
    await expect(page.getByRole('timer')).toHaveText('25:00');
    await page.keyboard.press('f');
    await expect(page.getByRole('tab', { name: 'Cronómetro', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('f');
    await expect(page.locator('.focus-timer-clock')).not.toHaveClass(/detail-title/);
    await page.screenshot({ path: `/tmp/ttd-focus-${width}-light.png`, fullPage: true });
    await page.locator('.focus-header summary').click();
    await page.getByRole('button', { name: '15 min', exact: true }).click();
    await page.locator('.focus-header summary').click();
    await page.getByRole('button', { name: 'Empezar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
    expect(starts[0]?.planned_minutes).toBe(15);
    await page.clock.fastForward(60_000);
    await page.getByRole('button', { name: 'Pausar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeVisible();
    const paused = await page.getByRole('timer').textContent();
    await page.clock.fastForward(60_000);
    await expect(page.getByRole('timer')).toHaveText(paused ?? '');
    await page.getByRole('button', { name: 'Terminar', exact: true }).click();
    await page.getByRole('tab', { name: 'Cronómetro', exact: true }).click();
    await page.getByRole('button', { name: 'Empezar', exact: true }).click();
    await page.clock.fastForward(30_000);
    await expect(page.getByRole('timer')).toHaveText('00:30');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.screenshot({ path: `/tmp/ttd-focus-${width}-dark.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
