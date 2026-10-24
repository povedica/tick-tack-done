import { test, expect } from '@playwright/test';
import { wtEFixture, evidence } from './wt-e.fixture';
test('TTD-AUD-134 RF-601/706: correction removes anchor warning', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('wt-e'), 'Specific viewport evidence');
  await wtEFixture(page, { anchorWarning: true });
  let due = '2026-11-02T23:00:00Z';
  await page.route('**/api/v1/tasks/task', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as { due_date: string };
      due = body.due_date;
    }
    await route.fulfill({
      json: {
        id: 'task',
        project_id: 'list',
        title: 'Ancla martes',
        content: '',
        priority: 'none',
        status: 'active',
        kind: 'task',
        due_date: due,
        start_date: null,
        time_zone: 'Europe/Madrid',
        is_all_day: true,
        repeat_rule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
        tag_ids: [],
        subtasks: [],
        items: [],
        activity: [],
        tags: [],
        attachments: [],
        comments: [],
        reminders: [],
        checklist_progress: { completed: 0, total: 0 },
      },
    });
  });
  await page.goto('/today?task=task');
  const move = page.getByRole('button', { name: /Mover al/ });
  await expect(move).toBeVisible();
  expect((await move.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await evidence(page, info, '134_anchor');
  await move.click();
  await expect(move).toHaveCount(0);
  expect(due).toBe('2026-11-08T23:00:00.000Z');
});
