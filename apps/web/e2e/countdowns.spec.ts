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
  const menus = page.locator('.popover-menu:visible');
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
  await dialog.getByText('Más opciones', { exact: true }).click();
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

for (const width of [390, 1280]) {
  for (const theme of ['light', 'dark']) {
    test(`TTD-AUD-22: all countdown colors keep readable text (${theme}, ${width}px)`, async ({
      page,
    }) => {
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
      await page.setViewportSize({ width, height: 1100 });
      await page.addInitScript((theme) => {
        localStorage.setItem('tick-tack-done.theme', theme);
        localStorage.setItem('tick-tack-done.account-prefs', '1');
      }, theme);
      await page.route('**/api/v1/**', async (route) => {
        if (await replySession(route)) return;
        const url = new URL(route.request().url());
        const body =
          url.pathname === '/api/v1/auth/session'
            ? {
                id: 'audit',
                csrf_token: 'test',
                email: 'audit@example.test',
                display_name: 'Audit',
              }
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
                    items: colors.flatMap((color) =>
                      [false, true].map((pinned) => ({
                        ...item,
                        id: `${color}-${pinned}`,
                        color,
                        pinned,
                        title: color,
                      })),
                    ),
                    next_cursor: null,
                  }
                : { items: [] };
        await route.fulfill({ json: body });
      });
      await page.goto('/countdowns');
      await expect(page.locator('.countdown-card')).toHaveCount(colors.length * 2);
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
              return [
                ...card.querySelectorAll('.countdown-title, .countdown-number, .countdown-unit, p'),
              ].flatMap((node) => {
                const count = node.closest('.countdown-count');
                const actualBg =
                  count === null ? bg : blend(rgba(getComputedStyle(count).backgroundColor), bg);
                const ink = blend(rgba(getComputedStyle(node).color), actualBg);
                const a = luminance(actualBg),
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
              });
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
  await expect(page.getByText('hasta el vie, 1 ene 2027')).toBeVisible();
});

for (const width of [390, 768, 1280]) {
  test(`BKL-058 RF-2451/2454: layout and keyboard menu at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await emptyCountdowns(page, () => {}, [
      { ...item, title: 'Reunión de evaluación del máster' },
      { ...item, id: 'second', pinned: true, color: 'blue' },
    ]);
    await page.goto('/countdowns');
    const card = page.locator('.countdown-card').first();
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    if (width >= 768) expect(Math.abs(box!.width - box!.height)).toBeLessThan(2);
    else expect(box!.width).toBeGreaterThan(box!.height * 2);
    if (width === 768)
      expect(
        await page
          .locator('.countdown-grid')
          .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length),
      ).toBe(3);
    const title = card.locator('.countdown-title');
    expect((await title.boundingBox())!.width).toBeGreaterThan(80);
    const trigger = card.getByRole('button', { name: 'Más acciones' });
    const bounds = await trigger.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await trigger.focus();
    await page.keyboard.press('Enter');
    const edit = page.getByRole('menuitem', { name: 'Editar', exact: true });
    await expect(edit).toBeVisible();
    expect((await page.locator('.popover-menu:visible').boundingBox())!.height).toBeLessThan(240);
    await expect(edit.locator('svg')).toHaveAttribute('width', '16');
    expect(await edit.evaluate((node) => Number(getComputedStyle(node).fontWeight))).toBeLessThan(
      600,
    );
    const remove = page.getByRole('menuitem', { name: 'Eliminar', exact: true });
    await expect(remove).toHaveClass(/is-danger/);
    expect(
      await remove.evaluate((node) => node.parentElement?.previousElementSibling?.className),
    ).toBe('menu-group');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await page.screenshot({ path: test.info().outputPath(`countdown-layout-${width}.png`) });
  });
}

test('BKL-058 RF-2453: emoji tray, recent selection, pasted grapheme and civil calendar', async ({
  page,
}) => {
  const saved: Record<string, unknown>[] = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await emptyCountdowns(page, (body) => saved.push(body));
  await page.goto('/countdowns');
  await page.getByRole('button', { name: 'Crear cuenta atrás' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva cuenta atrás' });
  await dialog.getByLabel('Nombre', { exact: true }).fill('Viaje de prueba');
  await dialog.getByRole('button', { name: 'Emoji', exact: true }).click();
  await page.getByRole('button', { name: '✈️', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Emoji', exact: true })).toHaveText('✈️');
  await dialog.getByRole('button', { name: 'Emoji', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recientes' })).toBeVisible();
  await page.getByLabel('Pegar un emoji').fill('👩🏽‍🚀');
  await page
    .locator('.countdown-emoji-picker')
    .getByRole('button', { name: 'Guardar', exact: true })
    .click();
  await dialog.getByLabel('Fecha', { exact: true }).fill('23/11/2026');
  await dialog.getByRole('button', { name: 'Abrir calendario' }).click();
  await expect(page.locator('.date-popover')).toBeVisible();
  await page
    .locator('.date-popover')
    .getByRole('button', { name: 'martes, 24 de noviembre de 2026', exact: true })
    .click();
  await expect(dialog.getByLabel('Fecha', { exact: true })).toHaveValue('24/11/2026');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(saved[0]).toMatchObject({ emoji: '👩🏽‍🚀', target_date: '2026-11-24' });
});

test('BKL-058 RF-2451/2454: English presentation and menu', async ({ page }) => {
  await emptyCountdowns(page, () => {}, [item]);
  await page.addInitScript(() => localStorage.setItem('tick-tack-done.locale', 'en'));
  await page.route(/\/api\/v1\/(me|auth\/session)$/, async (route) => {
    await route.fulfill({
      json: {
        id: 'fixture-user',
        email: 'fixture@example.test',
        display_name: 'Fixture',
        csrf_token: 'fixture-csrf',
        time_zone: 'Europe/Madrid',
        locale: 'en',
        features: {},
      },
    });
  });
  await page.goto('/countdowns');
  await expect(page.getByText('days', { exact: true })).toBeVisible();
  await expect(page.locator('.countdown-card p')).toHaveText('until Fri, Jan 1, 2027');
  await page.locator('.countdown-actions button').click();
  for (const name of ['Edit', 'Pin', 'Archive', 'Delete'])
    await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible();
});

test('BKL-058 RF-2450/2456: saved emoji appears in Today and sidebar', async ({ page }) => {
  await emptyCountdowns(page, () => {}, [{ ...item, kind: 'today', days: 0, emoji: '📚' }]);
  await page.goto('/today');
  await expect(page.locator('.countdown-today')).toContainText('📚');
  const expand = page.getByRole('button', { name: 'Expandir la barra', exact: true });
  if (await expand.isVisible()) await expand.click();
  await expect(page.locator('.countdown-side')).toContainText('📚');
});
