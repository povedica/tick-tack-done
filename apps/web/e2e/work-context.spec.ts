import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';

test('outside work hours, Today offers Mostrar trabajo until the next start', async ({ page }) => {
  await page.clock.install({ time: '2026-10-27T20:00:00.000Z' });
  await r80Fixture(page);
  let hidden = true;
  await page.route('**/api/v1/me/work-context', async (route) => {
    if (route.request().method() === 'PATCH') {
      hidden = route.request().postDataJSON().show_work !== true;
    }
    await route.fulfill({
      json: {
        work_day_start: '09:00',
        work_day_end: '18:00',
        work_days: ['MO', 'TU', 'WE', 'TH', 'FR'],
        work_folder_ids: [],
        work_project_ids: [],
        work_tag_ids: [],
        hide_work_outside_hours: true,
        show_work_until: hidden ? null : '2026-10-28T08:00:00.000Z',
        is_work_time_now: false,
        work_hidden_now: hidden,
        next_work_start: '2026-10-28T08:00:00.000Z',
        counts: { lists: 1, tags: 0, active_tasks: 1 },
      },
    });
  });
  await page.goto('/today');
  await expect(page.getByText(/fuera de jornada/)).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar trabajo' }).click();
  await expect(page.getByRole('button', { name: 'Ocultar trabajo' })).toBeVisible();
});
