import path from 'node:path';
import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';
const phase = process.env.R80_PHASE ?? 'antes';
const screens = [
  { id: 90, name: 'fecha-composer', route: '/today', composer: true, date: true },
  { id: 90, name: 'fecha-detalle', route: '/today?task=task', date: true },
  { id: 84, name: 'foco', route: '/focus' },
  { id: 101, name: 'foco', route: '/focus' },
  { id: 81, name: 'ancla-repeticion', route: '/today?task=task' },
  { id: 87, name: 'calendario-dia', route: '/calendar/day?date=2026-10-22' },
  { id: 88, name: 'calendario-dos-semanas', route: '/calendar/two-weeks?date=2026-10-22' },
  { id: 89, name: 'calendario-semana', route: '/calendar/week?date=2026-10-22' },
  { id: 91, name: 'hoy', route: '/today' },
  { id: 91, name: 'hoy-seleccion', route: '/today?task=task' },
  { id: 91, name: 'lista', route: '/list/list' },
  { id: 91, name: 'lista-seleccion', route: '/list/list?task=task' },
  { id: 92, name: 'composer-hoy', route: '/today', composer: true },
  { id: 92, name: 'composer-lista', route: '/list/list', composer: true },
  { id: 93, name: 'sidebar', route: '/calendar/week?date=2026-10-22' },
  { id: 98, name: 'agenda', route: '/calendar/agenda?date=2026-10-22' },
];
for (const screen of screens)
  test(`TTD-AUD-${screen.id} evidencia ${screen.name}`, async ({ page }, info) => {
    page.on('console', (message) => {
      if (message.type() === 'error') console.log(message.text());
    });
    await r80Fixture(page, { filtering: true, anchorWarning: screen.id === 81 });
    await page.goto(screen.route);
    await expect(page.locator('.center').first()).toBeVisible();
    const theme = info.project.name.endsWith('dark') ? 'dark' : 'light';
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    if (screen.composer) {
      await page.keyboard.press('n');
      await expect(page.locator('.calendar-quick-add').first()).toBeVisible();
    }
    if ('date' in screen && screen.date) {
      if (screen.composer) await page.locator('[role=dialog] .composer-date').click();
      else await page.locator('.detail-meta-chip').first().click();
      await expect(page.locator('.date-popover')).toBeVisible();
    }
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: path.resolve(
        '../../docs/audit/evidencias/r80',
        `${screen.id}_${screen.name}_${phase}_${info.project.name.replace('-', '_')}.png`,
      ),
      animations: 'disabled',
    });
  });
