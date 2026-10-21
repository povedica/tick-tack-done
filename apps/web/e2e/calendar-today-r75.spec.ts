import { expect, test } from '@playwright/test';

// Deliberately different from the account zone, just before Madrid midnight.
test.use({ timezoneId: 'America/New_York' });
for (const mobile of [false, true]) {
  test(`TTD-AUD-75.7: filled today circles ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 });
    await page.clock.install({ time: new Date('2026-10-21T21:59:59Z') });
    await page.addInitScript(() => localStorage.setItem('tick-tack-done.account-prefs', '1'));
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
      let json: unknown = { items: [], next_cursor: null };
      if (path === '/me' || path === '/auth/session')
        json = {
          id: 'user',
          display_name: 'Test',
          email: 'test@example.test',
          csrf_token: 'test',
          time_zone: 'Europe/Madrid',
          locale: 'es',
          features: {},
        };
      if (path === '/calendar/events') json = { external: [], tasks: [] };
      await route.fulfill({ status: 200, json });
    });
    await page.goto('/calendar/week?date=2026-10-21');
    const number = page.locator('.hour-headers [data-today="true"]');
    await expect(number).toHaveText('21');
    await expect(number).toHaveCSS('border-radius', '50%');
    for (const theme of ['light', 'dark']) {
      for (const accent of ['blue', 'violet', 'teal', 'amber', 'rose', 'slate']) {
        await page.evaluate(
          ({ theme, accent }) => {
            document.documentElement.dataset.theme = theme;
            document.documentElement.dataset.accent = accent;
          },
          { theme, accent },
        );
        const style = await number.evaluate((node) => {
          const css = getComputedStyle(node),
            rect = node.getBoundingClientRect();
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = css.backgroundColor;
          ctx.fillRect(0, 0, 1, 1);
          const rgb = Array.from(ctx.getImageData(0, 0, 1, 1).data)
            .slice(0, 3)
            .map((c) => {
              const v = c / 255;
              return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            });
          const luminance = rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
          return {
            contrast: 1.05 / (luminance + 0.05),
            width: rect.width,
            height: rect.height,
            radius: css.borderRadius,
            color: css.color,
            background: css.backgroundColor,
          };
        });
        expect(Math.abs(style.width - style.height)).toBeLessThanOrEqual(0.5);
        expect(style.radius).toBe('50%');
        expect(style.contrast).toBeGreaterThanOrEqual(4.5);
        expect(style.color).toBe('rgb(255, 255, 255)');
        expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
      }
    }
    await page.clock.fastForward(1001);
    await expect(number).toHaveText('22');
    await expect(number).toHaveAttribute('aria-current', 'date');
    for (const view of ['month', 'year']) {
      await page.goto(`/calendar/${view}?date=2026-10-22`);
      const marks = page.locator(
        view === 'month' ? '.cal-cell .today-mark' : '.year-num.today-mark',
      );
      await expect(marks.first()).toBeVisible();
      for (const mark of await marks.all()) {
        const box = await mark.boundingBox();
        expect(Math.abs(box!.width - box!.height)).toBeLessThanOrEqual(0.5);
        await expect(mark).toHaveCSS('color', 'rgb(255, 255, 255)');
      }
    }
    await page.goto('/calendar/week?date=2026-10-22');
    await page.locator('.calendar-period > button').click();
    const picker = page.locator('.calendar-jump-grid .today-mark');
    await expect(picker).toHaveText('22');
    const box = await picker.boundingBox();
    expect(Math.abs(box!.width - box!.height)).toBeLessThanOrEqual(0.5);
  });
}
