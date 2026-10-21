import { expect, test } from '@playwright/test';

// Contract fixtures: these checks validate the shell, not a real backend/session.
for (const mobile of [false, true]) {
  for (const theme of ['light', 'dark']) {
    test(`TTD-AUD-77: avatar progress ${mobile ? 'mobile' : 'desktop'} ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize(
        mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
      );
      await page.addInitScript((theme) => {
        localStorage.setItem('tick-tack-done.account-prefs', '1');
        localStorage.setItem('tick-tack-done.theme', theme);
      }, theme);
      await page.route('**/api/v1/**', async (route) => {
        const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
        let json: unknown = { items: [], next_cursor: null };
        if (path === '/me' || path === '/auth/session')
          json = {
            id: 'user',
            display_name: 'Pablo',
            email: 'pablo@example.test',
            csrf_token: 'test',
            time_zone: 'Europe/Madrid',
            locale: 'es',
            features: {},
          };
        if (path === '/statistics/overview' || path === '/stats/overview')
          json = { summary: { achievement: { enabled: true, score: 14 }, streak_current: 2 } };
        await route.fulfill({ status: 200, json });
      });
      await page.goto('/today');
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      await expect(page.locator('.control-chip, .mobile-control-bar')).toHaveCount(0);
      if (mobile) await page.locator('.bottom-bar').getByRole('button', { name: /Más/ }).click();
      const avatar = page.getByRole('button', { name: 'Menú de cuenta' }).filter({ visible: true });
      await avatar.click();
      const menu = page.getByRole('menu', { name: 'Menú de cuenta' });
      await expect(
        menu.getByRole('menuitem', { name: /Racha 2 días. Control 14 de 100/ }),
      ).toBeVisible();
      await expect(menu.getByText('Tu progreso')).toBeVisible();
      const box = await menu.boundingBox();
      expect(box).not.toBeNull();
      if (mobile) {
        expect(box!.x).toBe(0);
        expect(box!.width).toBe(390);
        expect(Math.abs(box!.y + box!.height - 844)).toBeLessThanOrEqual(1);
        for (const row of await menu.locator('.account-menu-links [role="menuitem"]').all())
          expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      } else expect(box!.width).toBe(256);
      await page.screenshot({
        path: `/tmp/ttd-r75-77-${mobile ? 'mobile' : 'desktop'}-${theme}.png`,
      });
      await menu.press('End');
      await expect(menu.getByRole('menuitem', { name: 'Cerrar sesión' })).toBeFocused();
      await menu.press('Escape');
      await expect(menu).toHaveCount(0);
      await expect(avatar).toBeFocused();
    });
  }
}
