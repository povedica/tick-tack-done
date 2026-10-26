import { expect, test } from '@playwright/test';
import { openBoard, wtBFixture } from './wt-b.fixture';
test('RF-204 TTD-AUD-110: move without dragging updates both counts', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('wt-b'));
  await wtBFixture(page);
  await openBoard(page);
  const card = page.locator('.kanban-card').filter({ hasText: 'Tarjeta 1' }).first();
  await card.getByRole('button', { name: 'Más acciones', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Mover a…' }).click();
  expect(
    await page
      .getByRole('dialog', { name: 'Mover a…' })
      .evaluate((node) => getComputedStyle(node).backgroundColor),
  ).not.toBe('rgba(0, 0, 0, 0)');
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/wt-b/110_hoja_despues_${info.project.use.viewport!.width}_${info.project.name.endsWith('dark') ? 'dark' : 'light'}.png`,
  });
  await page.getByRole('menuitem', { name: 'Hoy 1', exact: true }).click();
  await expect(
    page
      .locator('section.kanban-col')
      .nth(1)
      .locator('.kanban-card')
      .filter({ hasText: 'Tarjeta 1' }),
  ).toBeVisible();
  await expect(page.locator('section.kanban-col').first().locator('h3')).toContainText('14');
  await expect(page.locator('section.kanban-col').nth(1).locator('h3')).toContainText('2');
});
test('RF-1002 TTD-AUD-110: WIP leaves the source intact and keyboard opens the menu', async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith('wt-b'));
  await wtBFixture(page, { wip: true });
  await openBoard(page);
  const trigger = page
    .locator('.kanban-card')
    .first()
    .getByRole('button', { name: 'Más acciones', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Mover a…' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Hoy 1', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/WIP|límite/i);
  await expect(page.locator('section.kanban-col').first().locator('h3')).toContainText('15');
  await expect(page.locator('section.kanban-col').first().locator('.kanban-card')).toHaveCount(15);
});
test('TTD-AUD-110: Today uses the same accessible move sheet', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('wt-b'));
  await wtBFixture(page);
  await page.goto('/today?view=kanban&group=priority');
  if (info.project.use.viewport!.width <= 768)
    await page.getByRole('tab', { name: 'Sin prioridad 18' }).click();
  await page
    .locator('.is-kanban [data-kanban-column="none"]')
    .getByRole('button', { name: 'Más acciones', exact: true })
    .first()
    .click();
  await page.getByRole('menuitem', { name: 'Mover a…' }).click();
  const request = page.waitForRequest(
    (req) => req.method() === 'PATCH' && req.url().includes('/tasks/task-'),
  );
  await page.getByRole('menuitem').filter({ hasText: /Alta/ }).click();
  expect((await request).postDataJSON()).toEqual({ priority: 'high' });
  await expect(
    page
      .locator('.is-kanban .task-group')
      .filter({ has: page.locator('summary', { hasText: 'Alta' }) })
      .locator('.task-row'),
  ).toHaveCount(1);
});
