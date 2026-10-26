import { test, expect } from '@playwright/test';
import { wtEFixture, evidence } from './wt-e.fixture';
test('TTD-AUD-126 RF-2204: ongoing and closed reports expose seven days and retry stats failures', async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith('wt-e'), 'Specific viewport evidence');
  await wtEFixture(page);
  const days = Array.from({ length: 7 }, (_, index) => ({
    date: `2026-10-${19 + index}`,
    completed: 2,
    created: 3,
  }));
  await page.route('**/api/v1/reports/weekly', (route) =>
    route.fulfill({
      json: { items: [{ week: '2026-10-19', payload: { days, metrics_version: 2 } }] },
    }),
  );
  let failed = false;
  await page.route('**/api/v1/stats/overview?**', (route) =>
    route.fulfill(
      failed
        ? { status: 503, json: { error: { code: 'unavailable', message: 'Synthetic' } } }
        : { json: { summary: { completed: 8, created: 12 }, daily: days } },
    ),
  );
  await page.goto('/reports/weekly');
  await expect(page.locator('.week-day')).toHaveCount(7);
  await expect(page.getByText('Sin detalle diario verificable')).toHaveCount(0);
  await expect(page.locator('.week-day').nth(6).locator('i')).toHaveCount(0);
  await expect(page.locator('.weekly-page').getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await evidence(page, info, '126_weekly');
  failed = true;
  await page.reload();
  await expect(page.getByRole('alert')).toBeVisible();
  failed = false;
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.locator('.weekly-page').getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.clock.setFixedTime(new Date('2026-10-26T10:00:00Z'));
  await page.goto('/reports/weekly/2026-10-19');
  await expect(page.locator('.week-day')).toHaveCount(7);
});
