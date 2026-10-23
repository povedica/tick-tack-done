import path from 'node:path';
import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';

test('TTD-AUD-94: source step offers 18 by default and explains the 17 excluded when disabled', async ({
  page,
}, info) => {
  await r80Fixture(page);
  let sources: Record<string, boolean> = {};
  await page.route('**/api/v1/planning/sessions', async (route) => {
    sources = route.request().postDataJSON();
    const cards = Array.from({ length: sources.overdue ? 18 : 1 }, (_, i) => ({
      task_id: `task-${i}`,
      title: i ? `Vencida sintética ${i}` : 'Tarea de hoy',
      section: i ? 'overdue' : 'today',
      project_id: 'list',
      project_name: 'Lista sintética',
      reason_text: i ? 'Vencida' : 'Hoy',
      recurring: false,
    }));
    await route.fulfill({
      json: {
        id: 'session',
        local_date: '2026-10-22',
        revision: 0,
        state: 'draft',
        hidden_overdue: sources.overdue ? 0 : 17,
        totals: { today: 1, overdue: 17, inbox: 0, undated: 0 },
        cards,
        decisions: [],
        preview: { effects: [] },
      },
    });
  });
  await page.goto('/plan/day');
  await expect(page.getByRole('heading', { name: 'Plan del día', exact: true })).toBeVisible();
  await expect(page.locator('.plan-task-list, .plan-sources').first()).toBeVisible();
  await page.evaluate(
    (theme) => (document.documentElement.dataset.theme = theme),
    info.project.name.endsWith('dark') ? 'dark' : 'light',
  );
  const phase = process.env.R80_PHASE ?? 'antes';
  const screenshot = async (screen: string) =>
    page.screenshot({
      path: path.resolve(
        '../../test-artifacts/audit/evidencias/r80',
        `94_${screen}_${phase}_${info.project.name.replace('-', '_')}.png`,
      ),
      animations: 'disabled',
    });
  await screenshot('fuentes');
  if (phase === 'antes') await screenshot('plan');
  const overdue = page.getByRole('checkbox', { name: 'Vencidas (17)', exact: true });
  await expect(overdue).toBeChecked();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.locator('.plan-task-list>li')).toHaveCount(18);
  expect(sources).toMatchObject({ today: true, overdue: true, inbox: false, undated: false });
  if (phase !== 'antes') await screenshot('plan');
  await page.reload();
  await overdue.uncheck();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.locator('.plan-task-list>li')).toHaveCount(1);
  await expect(page.getByText('17 vencidas quedan fuera', { exact: false })).toBeVisible();
  await page.reload();
  await expect(overdue).not.toBeChecked();
});
