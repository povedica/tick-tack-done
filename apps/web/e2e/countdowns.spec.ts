import { replySession } from './mock-session';
import { expect, test, type Page } from '@playwright/test';

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

async function emptyCountdowns(
  page: Page,
  onCreate: (body: Record<string, unknown>) => void,
  items: (typeof item)[] = [],
) {
  await page.addInitScript(() => localStorage.setItem('tick-tack-done.account-prefs', '1'));
  await page.route('**/api/v1/**', async (route) => {
    if (await replySession(route)) return;
    const path = new URL(route.request().url()).pathname;
    let body: unknown = { items: [] };
    if (path === '/api/v1/countdowns') body = { items, next_cursor: null };
    if (path === '/api/v1/auth/session')
      body = {
        id: 'audit',
        csrf_token: 'test',
        email: 'audit@example.test',
        display_name: 'Audit',
      };
    if (path === '/api/v1/me')
      body = {
        id: 'audit',
        display_name: 'Audit',
        email: 'audit@example.test',
        locale: 'es',
        time_zone: 'Europe/Madrid',
        features: {},
      };
    if (path === '/api/v1/countdowns' && route.request().method() === 'POST') {
      const draft = route.request().postDataJSON() as Record<string, unknown>;
      onCreate(draft);
      body = { ...item, ...draft };
    }
    await route.fulfill({ json: body });
  });
}

test('TTD-AUD-24: countdown menus close on selection, Escape, outside click and replacement', async ({
  page,
}) => {
  await emptyCountdowns(page, () => {}, [item]);
  await page.goto('/countdowns');
  const create = page.getByText('Nueva', { exact: true });
  const menus = page.locator('.countdown-menu:visible');
  await create.click();
  await expect(menus).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(menus).toHaveCount(0);
  await create.click();
  await page.getByText('Aniversario', { exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Nueva cuenta atrás' })).toBeVisible();
  await expect(menus).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await create.click();
  const actions = page
    .locator('.countdown-actions')
    .locator('summary, button[aria-haspopup="menu"]');
  await actions.click();
  await expect(menus).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(menus).toHaveCount(0);
  await expect(actions).toBeFocused();
  await create.click();
  await page.getByRole('heading', { name: 'Cuenta atrás', exact: true }).click();
  await expect(menus).toHaveCount(0);
});

test('TTD-AUD-21: desktop countdown heading stays on one line', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await emptyCountdowns(page, () => {});
  await page.goto('/countdowns');
  const heading = page.getByRole('heading', { name: 'Cuenta atrás', exact: true });
  await expect(heading).toBeVisible();
  const size = await heading.evaluate((node) => ({
    height: node.getBoundingClientRect().height,
    font: Number.parseFloat(getComputedStyle(node).fontSize),
  }));
  expect(size.height).toBeLessThan(size.font * 1.8);
});

test('TTD-AUD-23: mobile countdown form aligns controls and saves a Spanish civil date', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 844 });
  const saved: Record<string, unknown>[] = [];
  await emptyCountdowns(page, (body) => saved.push(body));
  await page.goto('/countdowns');
  await page.getByRole('button', { name: 'Crear cuenta atrás' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva cuenta atrás' });
  expect(
    await dialog.evaluate(
      (node) =>
        node.scrollWidth <= node.clientWidth && node.getBoundingClientRect().width <= innerWidth,
    ),
  ).toBe(true);
  const aligned = await dialog
    .locator('label:has(input[type="checkbox"]), label:has(input[type="radio"])')
    .evaluateAll((labels) =>
      labels.every((label) => {
        const input = label.querySelector('input')!;
        const text = [...label.childNodes].find(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        );
        if (!text) return false;
        const range = document.createRange();
        range.selectNodeContents(text);
        const a = input.getBoundingClientRect(),
          b = range.getBoundingClientRect();
        return (
          a.right <= b.left + 1 && Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 5
        );
      }),
    );
  expect(aligned).toBe(true);
  await page.screenshot({ path: test.info().outputPath('countdown-dialog-mobile.png') });
  const date = dialog.getByLabel('Fecha', { exact: true });
  await expect(date).toHaveAttribute('type', 'text');
  await expect(date).toHaveAttribute('placeholder', 'dd/mm/aaaa');
  await dialog.getByLabel('Nombre', { exact: true }).fill('Cumpleaños');
  await date.fill('31/02/2027');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  expect(saved).toHaveLength(0);
  await date.fill('23/11/2026');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(saved).toHaveLength(1);
  expect(saved[0]?.target_date).toBe('2026-11-23');
});

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
      if (await replySession(route)) return;
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
    if (await replySession(route)) return;
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
  await expect(page.getByText('días · hasta 1 ene 2027')).toBeVisible();
});
