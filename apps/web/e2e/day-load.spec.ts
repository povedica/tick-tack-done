import { expect, test } from '@playwright/test';
for (const width of [1440, 390])
  for (const theme of ['light', 'dark']) {
    test(`RF-2671 unified plan preserves untouched tasks and previews adjustments ${width} ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(() => localStorage.setItem('tick-tack-done.account-prefs', '1'));
      let applied = 0;
      let decisions: { task_id: string; decision: string; target_date: string | null }[] = [];
      const card = {
        task_id: 'one',
        title: 'Informe sintético',
        suggested: { decision: 'plan_day', target_date: '2026-10-22', reason: 'Carga' },
      };
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
            features: { day_replan: true },
            locale: 'es',
          };
        if (path === '/plans')
          body = {
            initial_applied_at: '2026-10-21T06:00:00Z',
            last_applied_at: '2026-10-21T06:00:00Z',
            adjustment_count: 0,
          };
        if (path === '/planning/replan/sessions') {
          expect(route.request().postDataJSON()).toMatchObject({ apply_suggestions: false });
          body = {
            id: 'session',
            revision: 1,
            queue: { cards: [card] },
            decisions: [],
            load: {
              today: { task_minutes: 600, available_minutes: 540, status: 'overload' },
              tomorrow: { status: 'ok' },
            },
          };
        }
        if (path.includes('/decisions/')) {
          decisions = [
            {
              task_id: 'one',
              ...(route.request().postDataJSON() as {
                decision: string;
                target_date: string | null;
              }),
            },
          ];
          body = { id: 'session', revision: 2, decisions };
        }
        if (path.endsWith('/apply')) {
          applied++;
          body = { applied: [], closed: true };
        }
        await route.fulfill({ json: body });
      });
      await page.goto('/replan');
      await expect(page).toHaveURL(/\/plan\/day/);
      await expect(page.getByRole('heading', { name: 'Plan del día', exact: true })).toBeVisible();
      expect(applied).toBe(0);
      await expect(page.getByRole('button', { name: 'Aplicar replanificación' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Usar sugerencia' }).click();
      await expect(page.getByRole('heading', { name: 'Cambios antes de aplicar' })).toBeVisible();
      expect(applied).toBe(0);
      await page.evaluate(
        (theme) => document.documentElement.setAttribute('data-theme', theme),
        theme,
      );
      await page.screenshot({
        path: `../../test-artifacts/reviews/assets/day-plan-2026-10-21/${width}-${theme}.png`,
      });
      await page.getByRole('button', { name: /Aplicar/ }).click();
      await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
      expect(applied).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
  }
