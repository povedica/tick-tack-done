import { test, expect } from '@playwright/test';
import { wtEFixture, evidence } from './wt-e.fixture';

test('Settings refinement: selected options, aligned workday fields and primary save buttons', async ({
  page,
}, info) => {
  await wtEFixture(page);
  let me = {
    id: 'user',
    email: 'test@example.test',
    display_name: 'Prueba',
    locale: 'es',
    time_zone: 'Europe/Madrid',
    work_day_start: '09:00',
    work_day_end: '18:00',
    evening_start: '18:00',
    shutdown_reminder_time: '21:30',
    default_task_duration_minutes: 30,
    deadline_soon_days: 2,
    features: {},
  };
  await page.route('**/api/v1/me', async (route) => {
    if (route.request().method() !== 'GET') me = { ...me, ...route.request().postDataJSON() };
    await route.fulfill({ json: me });
  });
  await page.goto('/settings/appearance');
  await expect(page.getByRole('heading', { name: 'Apariencia', exact: true })).toBeVisible();
  for (const [group, label] of [
    ['Tema', 'Automático'],
    ['Densidad', 'Cómoda'],
    ['Inicio de semana', 'Lunes'],
    ['Idioma', 'Automático'],
  ]) {
    const control = page
      .getByRole('radiogroup', { name: group, exact: true })
      .getByRole('button', { name: label, exact: true });
    await control.click();
    await expect(control).toHaveAttribute('aria-pressed', 'true');
    expect(await control.evaluate((e) => getComputedStyle(e).boxShadow)).not.toBe('none');
  }
  await evidence(page, info, 'refinement_appearance');
  await page.goto('/settings/workday');
  const start = page.getByLabel('Empieza', { exact: true });
  await expect(start).toHaveValue('09:00');
  const rows = page.locator('.workday-setting-row');
  await expect(rows).toHaveCount(6);
  for (const row of await rows.all()) {
    const a = (await row.locator('label').boundingBox())!;
    const b = (await row.locator('input').boundingBox())!;
    expect(Math.abs(a.y + a.height / 2 - b.y - b.height / 2)).toBeLessThan(2);
  }
  const save = page.getByRole('button', { name: 'Guardar', exact: true });
  await expect(save).toHaveClass(/is-primary/);
  const bg = await save.evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(bg).not.toBe('rgb(255, 255, 255)');
  await evidence(page, info, 'refinement_workday');
  await start.fill('08:30');
  await save.click();
  await expect.poll(() => me.work_day_start).toBe('08:30');
  await page.goto('/settings/focus');
  await expect(page.getByRole('heading', { name: 'Tiempo de Foco', exact: true })).toBeVisible();
  await expect(page.locator('.focus-settings-page button[type="submit"]')).toHaveClass(
    /is-primary/,
  );
  await evidence(page, info, 'refinement_focus');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
