import { expect, test, type Locator, type Page } from '@playwright/test';
import { wtFFixture } from './wt-f.fixture';

async function lightPlan(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    localStorage.setItem('tick-tack-done.theme', 'light');
  });
  return wtFFixture(page);
}

async function headerFits(heading: Locator) {
  await expect
    .poll(() =>
      heading.evaluate((node) => {
        const parts = [
          node.querySelector('h2'),
          node.querySelector('.plan-when-someday'),
          node.querySelector('.popover-close'),
        ].filter((el): el is HTMLElement => el instanceof HTMLElement);
        const boxes = parts.map((el) => el.getBoundingClientRect());
        const dialogBox = node.closest('[role="dialog"]')?.getBoundingClientRect();
        const top = Math.min(...boxes.map((box) => box.top));
        const bottom = Math.max(...boxes.map((box) => box.bottom));
        return {
          count: parts.length,
          oneRow: bottom - top <= 48,
          noOverflow: node.scrollWidth <= node.clientWidth + 1,
          inside:
            dialogBox !== undefined &&
            boxes.every(
              (box) => box.left >= dialogBox.left - 1 && box.right <= dialogBox.right + 1,
            ),
          order: boxes.every(
            (box, index) => index === 0 || box.left >= (boxes[index - 1]?.right ?? 0) - 1,
          ),
        };
      }),
    )
    .toEqual({ count: 3, oneRow: true, noOverflow: true, inside: true, order: true });
}

test('desktop card shows someday and a delete-only overflow menu', async ({ page }, info) => {
  const fixture = await lightPlan(page, 1280, 800);
  await page.goto('/plan/day');
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[0]!.title);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  const controls = page.locator('.plan-desktop-controls');
  await expect(controls).toBeVisible();
  const layout = await controls.evaluate((node) => {
    const time = node.querySelector('.plan-time-controls')?.getBoundingClientRect();
    const actions = node.querySelector('.plan-action-row')?.getBoundingClientRect();
    const duration = node.querySelector('.sp-dur')?.getBoundingClientRect();
    const clock = node.querySelector('.sp-time')?.getBoundingClientRect();
    const someday = node.querySelector('.plan-someday-action')?.getBoundingClientRect();
    const segment = node.querySelector('.plan-day-segment')?.getBoundingClientRect();
    return {
      twoRows: Boolean(time && actions && actions.top >= time.bottom - 2),
      timeSharesRow: Boolean(duration && clock && Math.abs(duration.top - clock.top) < 12),
      somedayOnTheRight: Boolean(someday && segment && someday.left >= segment.right - 1),
    };
  });
  expect(layout).toEqual({ twoRows: true, timeSharesRow: true, somedayOnTheRight: true });
  await expect(controls.getByText('Duración', { exact: true })).toBeVisible();
  await expect(controls.getByText('Duración:', { exact: true })).toHaveCount(0);
  await expect(controls.getByText('Hora', { exact: true })).toBeVisible();
  await expect(controls.locator('.sp-time .lucide-clock')).toHaveCount(0);
  await expect(controls.locator('.plan-action-row .ui-kbd')).toHaveCount(5);
  expect(
    await controls
      .locator('.plan-action-row .ui-kbd')
      .evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).display === 'none')),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath('card-desktop.png'), fullPage: true });

  await controls.getByRole('button', { name: 'Acciones', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Acciones' });
  await expect(menu.getByRole('button', { name: 'Eliminar', exact: true })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Algún día', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  await controls.getByRole('button', { name: 'Algún día', exact: true }).click();
  await expect.poll(() => fixture.decisions[0]?.action).toBe('someday');
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[1]!.title);
  await page.keyboard.press('a');
  await expect.poll(() => fixture.decisions[1]?.action).toBe('someday');

  await page
    .locator('.plan-day-segment')
    .getByRole('button', { name: 'Otro día', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: '¿Cuándo?' });
  await expect(dialog.getByRole('button', { name: 'Elegir otra fecha' })).toBeVisible();
  await expect(dialog.locator('.plan-when-someday .lucide-cloud-sun')).toBeVisible();
  await headerFits(dialog.locator('.popover-heading'));
  await page.screenshot({ path: info.outputPath('when-desktop.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Algún día', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => fixture.decisions.at(-1)?.action).toBe('someday');
});

test('mobile card stays on the mobile controls and the someday pill fits', async ({
  page,
}, info) => {
  const fixture = await lightPlan(page, 375, 667);
  await page.goto('/plan/day');
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[0]!.title);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await expect(page.locator('.plan-desktop-controls')).toBeHidden();
  await expect(page.locator('.plan-day-segment')).toBeHidden();
  await expect(page.locator('.plan-mobile-actions')).toBeVisible();
  await expect(page.locator('.plan-mobile-actions button')).toHaveCount(5);
  await expect(page.locator('.plan-mobile-only .plan-more')).toBeVisible();
  await page.screenshot({ path: info.outputPath('card-mobile.png'), fullPage: true });

  await page.locator('.plan-mobile-only .plan-more-trigger').click();
  const menu = page.getByRole('dialog', { name: 'Acciones' });
  await expect(menu.getByRole('button', { name: 'Algún día', exact: true })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Eliminar', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.keyboard.press('o');
  const dialog = page.getByRole('dialog', { name: '¿Cuándo?' });
  await headerFits(dialog.locator('.popover-heading'));
  await expect(dialog.getByRole('button', { name: 'Elegir otra fecha' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('when-mobile.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Algún día', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => fixture.decisions[0]?.action).toBe('someday');
  await expect(page.locator('.plan-desktop-controls')).toBeHidden();
  await expect(page.locator('.plan-mobile-actions')).toBeVisible();
});
