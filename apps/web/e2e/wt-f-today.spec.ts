import { expect, test, type Page } from '@playwright/test';
import { r80Fixture } from './r80.fixture';

async function todayFixture(
  page: Page,
  load: { task_minutes: number; event_minutes: number; available_minutes: number; status: string },
  saved = false,
) {
  await r80Fixture(page);
  await page.clock.setFixedTime(new Date('2026-10-26T09:00:00Z'));
  await page.route('**/api/v1/planning/load?**', (route) =>
    route.fulfill({ json: { ...load, unestimated_count: 2 } }),
  );
  await page.route('**/api/v1/plans?**', (route) =>
    route.fulfill({
      json: {
        initial_applied_at: saved ? '2026-10-26T08:12:00Z' : null,
        last_applied_at: saved ? '2026-10-26T08:12:00Z' : null,
        adjustment_count: 0,
        time_zone: 'Europe/Madrid',
      },
    }),
  );
}
for (const row of [
  {
    status: 'ok',
    task_minutes: 60,
    event_minutes: 30,
    available_minutes: 120,
    phrase: 'Cabe · 30 min libres',
  },
  {
    status: 'tight',
    task_minutes: 105,
    event_minutes: 15,
    available_minutes: 120,
    phrase: 'Va justo · 0 min libres',
  },
  {
    status: 'overload',
    task_minutes: 130,
    event_minutes: 20,
    available_minutes: 120,
    phrase: 'No cabe · sobran 30 min',
  },
]) {
  test(`M12: Today displays ${row.status} including calendar events on mobile and desktop`, async ({
    page,
  }, info) => {
    await todayFixture(page, row);
    await page.goto('/today');
    const strip = page.getByRole('region', { name: 'Plan del día' });
    await expect(strip.getByText(row.phrase, { exact: true })).toBeVisible();
    await expect(strip.getByRole('link', { name: 'Planifica tu día' })).toHaveAttribute(
      'href',
      '/plan/day',
    );
    await expect(strip).not.toContainText('%');
    await expect(strip).not.toContainText('sin duración');
    await expect(strip).not.toContainText(' / ');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (row.status === 'ok')
      await page.screenshot({
        path: `../../test-artifacts/audit/evidencias/wt-f/M12_hoy_despues_${info.project.name}.png`,
        fullPage: true,
      });
  });
}
test('M12: saved Today plan uses profile time and offers replanning', async ({ page }, info) => {
  await todayFixture(
    page,
    { status: 'ok', task_minutes: 60, event_minutes: 30, available_minutes: 120 },
    true,
  );
  await page.goto('/today');
  const strip = page.getByRole('region', { name: 'Plan del día' });
  await expect(strip.getByText('Planificado a las 9:12', { exact: true })).toBeVisible();
  await expect(strip.getByRole('link', { name: 'Volver a planificar' })).toHaveAttribute(
    'href',
    '/plan/day',
  );
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/wt-f/M12_guardado_despues_${info.project.name}.png`,
    fullPage: true,
  });
  await strip.getByRole('link', { name: 'Volver a planificar' }).click();
  await expect(page).toHaveURL(/\/plan\/day/);
});
