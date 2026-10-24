import { expect, test } from '@playwright/test';
import { openBoard, wtBFixture } from './wt-b.fixture';

test('RF-1002 TTD-AUD-109: shared columns, contrast and drop feedback', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('wt-b'));
  await wtBFixture(page);
  await openBoard(page);
  const colors = await page
    .locator('.kanban-col')
    .first()
    .evaluate((column) => {
      const style = getComputedStyle(column);
      const card = getComputedStyle(column.querySelector('.kanban-card')!);
      const heading = getComputedStyle(column.querySelector('h3')!);
      const rgb = (value: string) =>
        value
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
      const luminance = (values: number[]) =>
        values
          .map((n) => n / 255)
          .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
          .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i]!, 0);
      const a = luminance(rgb(heading.color));
      const b = luminance(rgb(style.backgroundColor));
      return {
        column: style.backgroundColor,
        card: card.backgroundColor,
        body: getComputedStyle(document.body).backgroundColor,
        contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        token: style.getPropertyValue('--kanban-col-bg').trim(),
      };
    });
  expect(colors.column).not.toBe(colors.card);
  expect(colors.column).not.toBe(colors.body);
  expect(colors.contrast).toBeGreaterThanOrEqual(4.5);
  await page
    .locator('.kanban-col')
    .nth(1)
    .dispatchEvent('dragover', {
      dataTransfer: await page.evaluateHandle(() => new DataTransfer()),
    });
  await expect(page.locator('.kanban-col').nth(1)).toHaveClass(/is-over/);
  await expect(page.locator('.kanban-col').nth(1)).toHaveCSS('outline-style', 'dashed');
  await page.goto('/today?view=kanban&group=priority');
  await expect(page.locator('.is-kanban .task-group').first()).toBeVisible();
  expect(
    await page
      .locator('.is-kanban .task-group')
      .first()
      .evaluate((node) => getComputedStyle(node).getPropertyValue('--kanban-col-bg').trim()),
  ).toBe(colors.token);
});
