import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';
test.use({ deviceScaleFactor: 3 });
async function capture(
  page: import('@playwright/test').Page,
  info: import('@playwright/test').TestInfo,
  name: string,
) {
  await page.evaluate(
    (theme) => (document.documentElement.dataset.theme = theme),
    info.project.name.endsWith('dark') ? 'dark' : 'light',
  );
  await page.screenshot({
    path: path.resolve(
      '../../docs/audit/evidencias/r80',
      `96_${name}_${process.env.R80_PHASE ?? 'antes'}_${info.project.name.replace('-', '_')}.png`,
    ),
    animations: 'disabled',
  });
}

test('TTD-AUD-96.1: duration remains on one line', async ({ page }, info) => {
  await r80Fixture(page, { duration: 8820 });
  await page.route('**/api/v1/planning/load?*', async (route) =>
    route.fulfill({
      json: {
        task_minutes: 8820,
        available_minutes: 480,
        unestimated_count: 1,
        status: 'overload',
      },
    }),
  );
  await page.goto('/today');
  const duration = page.locator('.task-time[title*="6 d 3 h"]').first();
  await expect(duration).toBeVisible();
  await expect(page.getByText('1 tarea sin duración', { exact: true })).toBeVisible();
  await capture(page, info, 'duracion');
  const metrics = await duration.evaluate((node) => ({
    height: node.getBoundingClientRect().height,
    font: Number.parseFloat(getComputedStyle(node).fontSize),
    whiteSpace: getComputedStyle(node).whiteSpace,
  }));
  expect(metrics.height).toBeLessThanOrEqual(metrics.font * 1.4 + 1);
  expect(metrics.whiteSpace).toBe('nowrap');
  await expect(duration).toHaveAttribute('title', /6 d 3 h/);
  await duration.evaluate((node) => {
    node.parentElement!.style.width = '50px';
  });
  await page.clock.runFor(100);
  await expect(duration).toHaveText('6 d');
  await expect(duration).toHaveAttribute('title', /6 d 3 h/);
});

test('TTD-AUD-96.3/4: MCP client tabs are stable and JSON scrolls and copies exactly', async ({
  page,
}, info) => {
  await r80Fixture(page);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (text: string) => {
          (window as unknown as { copied: string }).copied = text;
          return Promise.resolve();
        },
      },
    }),
  );
  await page.goto('/settings/tokens');
  const tabs = page.getByRole('tablist', { name: 'Cliente' });
  await expect(tabs).toBeVisible();
  await capture(page, info, 'tokens');
  const before = await tabs.boundingBox();
  await tabs.getByRole('tab', { name: 'Otro', exact: true }).click();
  const after = await tabs.boundingBox();
  expect(before!.height).toBe(36);
  expect(after!.height).toBe(before!.height);
  expect(
    await tabs
      .getByRole('tab', { name: 'Otro', exact: true })
      .evaluate((node) => Number.parseFloat(getComputedStyle(node, '::after').height)),
  ).toBeGreaterThanOrEqual(44);
  const pre = page.locator('.token-snippet');
  const css = await pre.evaluate((node) => ({
    whiteSpace: getComputedStyle(node).whiteSpace,
    font: getComputedStyle(node).fontSize,
    overflow: getComputedStyle(node).overflowX,
    scroll: node.scrollWidth,
    client: node.clientWidth,
  }));
  expect(css.whiteSpace).toBe('pre');
  expect(css.font).toBe('12px');
  expect(css.overflow).toBe('auto');
  if (info.project.name.startsWith('mobile')) expect(css.scroll).toBeGreaterThan(css.client);
  const value = await pre.textContent();
  await page.getByRole('button', { name: 'Copiar configuración', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe(value);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('TTD-AUD-96.6: mini calendar and drawer measured at scale 3', async ({ page }, info) => {
  await r80Fixture(page, { filtering: true });
  await page.goto('/calendar/week?date=2026-10-22');
  const mobile = info.project.name.startsWith('mobile');
  await expect(page.locator(mobile ? '.mobile-week-mini' : '.calendar-sidebar')).toBeVisible();
  await capture(page, info, 'minicalendario');
  const cells = await page
    .locator(mobile ? '.mobile-week-mini a' : '.calendar-mini-day')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
      })),
    );
  if (mobile) await page.locator('.sidebar-fold-button').click();
  await expect(page.locator('.sidebar')).toBeVisible();
  await capture(page, info, 'cajon');
  const drawer = await page.locator('.sidebar').evaluate((node) => ({
    height: node.getBoundingClientRect().height,
    overflow: getComputedStyle(node).overflowY,
    scroll: node.scrollHeight,
    client: node.clientHeight,
  }));
  await writeFile(
    path.resolve(
      '../../docs/audit/r80',
      `96-minicalendario-${process.env.R80_PHASE ?? 'antes'}-${info.project.name}.json`,
    ),
    JSON.stringify({ cells, drawer, dpr: await page.evaluate(() => devicePixelRatio) }, null, 2),
  );
  await info.attach('measurements', {
    body: JSON.stringify({ cells, drawer, dpr: await page.evaluate(() => devicePixelRatio) }),
    contentType: 'application/json',
  });
  if (info.project.name.startsWith('mobile')) {
    expect(Math.min(...cells.map((cell) => cell.height))).toBeGreaterThanOrEqual(36);
    expect(drawer.height).toBe(844);
    expect(drawer.overflow).toBe('auto');
  }
});

test('TTD-AUD-96.5: long planning title uses two lines and opens its complete detail', async ({
  page,
}, info) => {
  await r80Fixture(page);
  const title =
    'Revisar todos los detalles de la propuesta con el equipo y preparar una respuesta completa antes de la reunión semanal'.padEnd(
      120,
      '.',
    );
  await page.route('**/api/v1/planning/sessions', async (route) =>
    route.fulfill({
      json: {
        id: 'session',
        local_date: '2026-10-22',
        state: 'draft',
        revision: 0,
        totals: { today: 1, overdue: 0, inbox: 0, undated: 0 },
        cards: [
          {
            task_id: 'task',
            title,
            section: 'today',
            project_id: 'list',
            project_name: 'Lista sintética',
            reason_text: 'Hoy',
            recurring: false,
          },
        ],
        decisions: [],
        preview: { effects: [] },
      },
    }),
  );
  await page.goto('/plan/day');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const link = page.locator('.plan-task-list .weekly-task-title');
  await expect(link).toBeVisible();
  await capture(page, info, 'plan-titulo');
  if (info.project.name.startsWith('mobile')) {
    const lines = await link.evaluate((node) => ({
      height: node.getBoundingClientRect().height,
      line: Number.parseFloat(getComputedStyle(node).lineHeight),
    }));
    expect(lines.height).toBeGreaterThan(lines.line + 1);
    expect(lines.height).toBeLessThanOrEqual(lines.line * 2 + 1);
  }
  const base = await page.evaluate(async () => (await fetch('/api/v1/tasks/task')).json());
  await page.route('**/api/v1/tasks/task', async (route) =>
    route.fulfill({ json: { ...base, title } }),
  );
  await link.click();
  await expect(page.locator('.detail-title')).toHaveValue(title);
});
