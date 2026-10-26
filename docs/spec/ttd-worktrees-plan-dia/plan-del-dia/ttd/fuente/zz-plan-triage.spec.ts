import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { r80Fixture } from './r80.fixture';
const OUT = '/workspace/ttd-audit/plan-del-dia/ttd';
const cards = [
  ['a', 'Preparar propuesta para el cliente', 'today', 'Trabajo', 'Vence hoy a las 17:00', false],
  ['b', 'Llamar al taller por la revisión', 'today', 'Bandeja', 'Planificada para hoy', false],
  ['c', 'Repaso diario de pendientes', 'today', 'Casa', 'Vence hoy', true],
  ['d', 'Revisar contrato del alquiler', 'overdue', 'Casa', 'Venció hace 3 días', false],
  ['e', 'Ordenar fotos del viaje', 'overdue', 'Personal', 'Venció hace 12 días', false],
  ['f', 'Renovar el DNI', 'overdue', 'Personal', 'Venció el 2 oct', false],
].map(([task_id, title, section, project_name, reason_text, recurring]) => ({ task_id, title, section, project_id: 'list', project_name, reason_text, recurring }));
async function planning(page: Page) {
  await page.route('**/api/v1/plan**', async (route) => {
    const p = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (p.startsWith('/planning/sessions')) {
      await route.fulfill({ json: { id: 'plan', local_date: '2026-10-24', revision: 1, state: 'draft', hidden_overdue: 0, cards, decisions: [], preview: { effects: [] },
        totals: { today: 3, overdue: 3, inbox: 7, undated: 25 }, load: { task_minutes: 370, available_minutes: 450, status: 'tight' } } });
      return;
    }
    if (p === '/plans') { await route.fulfill({ json: { initial_applied_at: null, last_applied_at: null, adjustment_count: 0, id: null, local_date: '2026-10-24', time_zone: 'Europe/Madrid', members: [] } }); return; }
    if (p === '/planning/load') { await route.fulfill({ json: { date: '2026-10-24', task_minutes: 370, event_minutes: 90, available_minutes: 540, unestimated_count: 2, unestimated_task_ids: [], ratio: 0.85, status: 'tight' } }); return; }
    await route.fallback();
  });
}
async function prep(page: Page, theme: string) {
  await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
  await page.evaluate(() => document.fonts.ready);
}
const desk = ['d-triage', 'd-hover', 'd-drag', 'd-dragday', 'd-help'];
const mob = ['m-card', 'm-days', 'm-block', 'm-sum', 'm-done', 'm-empty', 'm-error'];
test('boceto triaje con look ttd', async ({ page }, info) => {
  const theme = info.project.name.endsWith('dark') ? 'claro'.replace('claro', 'dark') : 'light';
  const desktop = info.project.name.startsWith('desktop');
  await r80Fixture(page, {});
  for (const v of desktop ? desk : mob) {
    await page.goto(`/plan/mock?v=${v}`);
    await expect(page.locator('.tri-page')).toBeVisible();
    if (desktop) {
      const sidebar = page.locator('.sidebar').first();
      if (await sidebar.isVisible().catch(() => false)) { await page.locator('body').press('['); await page.waitForTimeout(300); }
    }
    await prep(page, theme);
    await page.screenshot({ path: path.join(OUT, `NUEVO_${desktop ? 'escritorio-1280' : 'movil-390'}_${v.slice(2)}_${theme === 'dark' ? 'oscuro' : 'claro'}.png`), animations: 'disabled' });
  }
});
test('estado actual real (antes)', async ({ page }, info) => {
  const theme = info.project.name.endsWith('dark') ? 'dark' : 'light';
  const tag = `${info.project.name.startsWith('desktop') ? 'escritorio-1280' : 'movil-390'}_${theme === 'dark' ? 'oscuro' : 'claro'}`;
  await r80Fixture(page, {});
  await planning(page);
  await page.goto('/plan/day');
  await expect(page.getByRole('heading', { name: 'Plan del día' })).toBeVisible();
  await prep(page, theme);
  await page.screenshot({ path: path.join(OUT, `ANTES_${tag}_paso0.png`), animations: 'disabled' });
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByText('Revisar contrato del alquiler')).toBeVisible();
  await page.getByRole('checkbox', { name: /Revisar contrato/ }).check();
  await prep(page, theme);
  await page.screenshot({ path: path.join(OUT, `ANTES_${tag}_lista.png`), animations: 'disabled', fullPage: false });
});
