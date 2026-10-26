import { expect, test } from '@playwright/test';
import { openBoard, wtBFixture } from './wt-b.fixture';

test('RF-1002 TTD-AUD-108: carousel, tabs, sticky headers and explicit creation', async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith('wt-b'));
  const width = info.project.use.viewport!.width;
  await wtBFixture(page);
  await openBoard(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  if (width > 768) {
    await expect(page.getByRole('tablist', { name: 'Columnas del tablero' })).toBeHidden();
    return;
  }
  const board = page.locator('.kanban');
  const first = page.locator('section.kanban-col').first();
  await expect(board).toHaveCSS('scroll-snap-type', 'x mandatory');
  await expect(first).toHaveCSS('scroll-snap-stop', 'always');
  expect((await first.boundingBox())!.width).toBeCloseTo(width - 64, 0);
  const second = (await page.locator('section.kanban-col').nth(1).boundingBox())!;
  if (width <= 390) expect(width - second.x).toBeGreaterThanOrEqual(24);
  const heading = first.locator('h3');
  const y = (await heading.boundingBox())!.y;
  await first.evaluate((node) => {
    node.scrollTop = 300;
  });
  expect((await heading.boundingBox())!.y).toBeCloseTo(y, 0);
  await expect(page.getByRole('tab', { name: 'Pendientes 15' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: 'Después 1' }).click();
  await expect(page.getByRole('tab', { name: 'Después 1' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect
    .poll(async () => {
      const column = (await page.locator('section.kanban-col').nth(3).boundingBox())!;
      const container = (await board.boundingBox())!;
      return Math.abs(column.x - container.x - 16);
    })
    .toBeLessThanOrEqual(2);
  await page.getByRole('tab', { name: 'Vacía 0' }).click();
  const empty = page.locator('section.kanban-col').nth(4);
  await expect(empty).toContainText('No hay tareas');
  expect((await empty.boundingBox())!.height).toBeGreaterThanOrEqual(120);
  expect(
    (await empty.locator('.kanban-add-space button').boundingBox())!.height,
  ).toBeGreaterThanOrEqual(44);
  await empty.dispatchEvent('click');
  await expect(page.locator('.capture-sheet')).toHaveCount(0);
  await page.goto('/today?view=kanban&group=priority');
  const group = page.locator('.is-kanban .task-group').first();
  await expect(group).toHaveAttribute('open', '');
  await group.locator('summary').click();
  await expect(group).toHaveAttribute('open', '');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
});

test('TTD-AUD-108: a single fast relative scroll stops at the next column', async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith('wt-b') || info.project.use.viewport!.width > 390);
  await wtBFixture(page);
  await openBoard(page);
  await page.locator('.kanban').evaluate((node) => node.scrollBy({ left: 3 * innerWidth }));
  await expect
    .poll(() => page.locator('.kanban').evaluate((node) => node.scrollLeft))
    .toBeCloseTo(info.project.use.viewport!.width - 64 + 12, 0);
});
