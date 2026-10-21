import { expect, test } from '@playwright/test';

const item = {
  id: '6a1b784e-6bf6-4b79-bcee-a1513f4f5f99',
  title: 'Año Nuevo',
  type: 'countdown',
  emoji: '🎇',
  target_date: '2027-01-01',
  repeat_rule: 'none',
  day_mode: 'standard',
  color: 'pink',
  notes: null,
  show_in_sidebar: true,
  show_in_smart_list: true,
  pinned: false,
  archived_at: null,
  days: 74,
  kind: 'until',
  effective_date: '2027-01-01',
  reminders: [],
};

for (const theme of ['light', 'dark']) {
  test(`TTD-AUD-22: all countdown colors keep readable text (${theme})`, async ({ page }) => {
    const colors = [
      'none',
      'blue',
      'teal',
      'green',
      'lime',
      'orange',
      'red',
      'pink',
      'purple',
      'navy',
      'brown',
      'black',
      'rainbow',
    ];
    await page.setViewportSize({ width: 1280, height: 1100 });
    await page.addInitScript((theme) => {
      localStorage.setItem('tick-tack-done.theme', theme);
      localStorage.setItem('tick-tack-done.account-prefs', '1');
    }, theme);
    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      const body =
        url.pathname === '/api/v1/auth/session'
          ? { id: 'audit', csrf_token: 'test', email: 'audit@example.test', display_name: 'Audit' }
          : url.pathname === '/api/v1/me'
            ? {
                id: 'audit',
                display_name: 'Audit',
                email: 'audit@example.test',
                locale: 'es',
                theme,
                time_zone: 'Europe/Madrid',
                features: {},
              }
            : url.pathname === '/api/v1/countdowns'
              ? {
                  items: colors.map((color) => ({ ...item, id: color, color, title: color })),
                  next_cursor: null,
                }
              : { items: [] };
      await route.fulfill({ json: body });
    });
    await page.goto('/countdowns');
    await expect(page.locator('.countdown-card')).toHaveCount(colors.length);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const failures = await page.locator('.countdown-card').evaluateAll((cards) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d')!;
      const rgba = (color: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data];
      };
      const blend = (color: number[], bg: number[]) =>
        color.slice(0, 3).map((c, i) => c * (color[3]! / 255) + bg[i]! * (1 - color[3]! / 255));
      const luminance = (color: number[]) =>
        color
          .slice(0, 3)
          .map((v) => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          })
          .reduce((total, value, i) => total + value * [0.2126, 0.7152, 0.0722][i]!, 0);
      const surface = rgba(
        getComputedStyle(document.documentElement).getPropertyValue('--surface'),
      );
      return ['indigo', 'violet', 'teal', 'amber', 'rose', 'slate'].flatMap((accent) => {
        document.documentElement.dataset.accent = accent;
        return cards.flatMap((card) => {
          const style = getComputedStyle(card);
          const backgrounds = [
            style.backgroundColor,
            ...[...style.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((match) => match[0]),
          ];
          return backgrounds.flatMap((background) => {
            const bg = blend(rgba(background), surface);
            return [...card.querySelectorAll('.countdown-title, .countdown-number, p')].flatMap(
              (node) => {
                const ink = blend(rgba(getComputedStyle(node).color), bg);
                const a = luminance(bg),
                  b = luminance(ink);
                const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
                return ratio < 4.5
                  ? [
                      {
                        accent,
                        color: card.getAttribute('data-color'),
                        text: node.textContent,
                        ratio,
                      },
                    ]
                  : [];
              },
            );
          });
        });
      });
    });
    expect(failures).toEqual([]);
    await page.evaluate(() => {
      document.documentElement.dataset.accent = 'indigo';
    });
    await page.screenshot({ path: test.info().outputPath(`countdown-colors-${theme}.png`) });
  });
}

test('RF-2451: muestra una tarjeta Countdown con los días calculados por la API', async ({
  page,
}) => {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    if (request.url().includes('/api/v1/countdowns') && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [item], next_cursor: null }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.goto('/countdowns');

  await expect(page.getByRole('heading', { name: 'Cuenta atrás' })).toBeVisible();
  await expect(page.getByText('Año Nuevo')).toBeVisible();
  await expect(page.getByText('74', { exact: true })).toBeVisible();
  await expect(page.getByText('Faltan 74 días · 01/01/2027')).toBeVisible();
});
