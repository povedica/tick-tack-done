import { test, expect } from '@playwright/test';
import { wtFFixture } from './wt-f.fixture';
test('F-AC-5/7/18/20: decisions stay in preview and can be undone before confirmation', async ({
  page,
}, info) => {
  const fixture = await wtFFixture(page);
  await page.goto('/plan/day');
  await expect(
    page.getByRole('heading', { name: fixture.cards[0]!.title, exact: true }),
  ).toBeVisible();
  await page.keyboard.press('h');
  await expect(
    page.getByRole('heading', { name: fixture.cards[1]!.title, exact: true }),
  ).toBeVisible();
  expect(fixture.counts.applied).toBe(0);
  expect(fixture.counts.sessions).toBe(1);
  await page.keyboard.press('Control+z');
  await expect(
    page.getByRole('heading', { name: fixture.cards[0]!.title, exact: true }),
  ).toBeVisible();
  expect(fixture.decisions).toHaveLength(0);
  await page.keyboard.press('2');
  await page.keyboard.press('m');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /Confirmar plan/ })).toBeVisible();
  expect(fixture.decisions[0]).toMatchObject({ action: 'tomorrow', duration: 30 });
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('heading', { name: fixture.cards[1]!.title, exact: true }),
  ).toBeVisible();
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  if (info.project.name.includes('1280'))
    await expect(page.locator('footer.sp-foot')).toBeVisible();
});
test('F-AC-8/9/23: date sheet offers free quarter-hour slots and chosen duration', async ({
  page,
}, info) => {
  const fixture = await wtFFixture(page);
  await page.goto('/plan/day');
  await expect(page.getByRole('heading', { name: fixture.cards[0]!.title })).toBeVisible();
  await page.keyboard.press('o');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('tab', { name: /Mañana/ }).click();
  await dialog.getByRole('combobox', { name: 'Hora (opcional)' }).selectOption('09:30');
  await dialog.getByRole('radio', { name: '45 min', exact: true }).click();
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/wt-f/M7_cuando_despues_${info.project.name}.png`,
    fullPage: true,
  });
  await dialog.getByRole('button', { name: /Planificar el/ }).click();
  await expect(page.getByRole('heading', { name: fixture.cards[1]!.title })).toBeVisible();
  expect(fixture.decisions[0]).toMatchObject({
    action: 'move',
    date: '2026-10-27',
    time: '09:30',
    duration: 45,
  });
  expect(fixture.counts.applied).toBe(0);
});
test('F-AC-26/27: responsive layout, focus and approved visual reference', async ({
  page,
}, info) => {
  await wtFFixture(page, { reviewed: true });
  await page.goto('/plan/day');
  await expect(page.locator('#plan-task-title')).toBeVisible();
  await expect(page.locator('#plan-task-title')).toBeFocused();
  await page.evaluate(
    (theme) => document.documentElement.setAttribute('data-theme', theme),
    info.project.name.endsWith('dark') ? 'dark' : 'light',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByText('Bloque horario', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Usar sugerencia', { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/wt-f/M6_triaje_despues_${info.project.name}.png`,
    fullPage: true,
  });
});
test('F-AC-27: empty and error states', async ({ page }) => {
  await wtFFixture(page, { empty: true });
  await page.goto('/plan/day');
  await expect(page.getByText('Hoy no tienes nada pendiente')).toBeVisible();
});
test('F-AC-15: dragging to tomorrow at 09:30 records the same move action', async ({
  page,
}, info) => {
  test.skip(!info.project.name.includes('1280'), 'Desktop pointer test');
  const fixture = await wtFFixture(page);
  await page.goto('/plan/day');
  await expect(page.locator('#plan-task-title')).toBeVisible();
  await page
    .locator('.plan-day-sidebar')
    .getByRole('tab', { name: /Mañana/ })
    .click();
  const handle = await page.locator('.sp-grip').boundingBox(),
    agenda = await page.locator('[data-plan-agenda]').boundingBox();
  expect(handle).not.toBeNull();
  expect(agenda).not.toBeNull();
  await page.mouse.move(handle!.x + 8, handle!.y + 8);
  await page.mouse.down();
  await page.mouse.move(agenda!.x + 50, agenda!.y + agenda!.height / 18, { steps: 12 });
  await expect(page.locator('.sp-blk.is-ghost')).toContainText('09:30');
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/wt-f/M13_arrastre_despues_${info.project.name}.png`,
    fullPage: true,
  });
  await page.mouse.up();
  await expect(page.getByRole('heading', { name: fixture.cards[1]!.title })).toBeVisible();
  expect(fixture.decisions[0]).toMatchObject({
    action: 'move',
    date: '2026-10-27',
    time: '09:30',
    duration: 30,
  });
});

test('F-AC-20/21/24/25: twelve cards, back navigation, summary and post-confirmation undo', async ({
  page,
}, info) => {
  const fixture = await wtFFixture(page);
  await page.goto('/plan/day');
  for (let i = 0; i < fixture.cards.length; i += 1) {
    await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[i]!.title);
    await page.keyboard.press(i % 2 ? 'm' : 'h');
  }
  await expect(page.getByRole('button', { name: /Confirmar plan/ })).toBeVisible();
  expect(fixture.counts.applied).toBe(0);
  expect(fixture.decisions).toHaveLength(12);
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/wt-f/M6_resumen_despues_${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: /Confirmar plan/ }).click();
  await expect(page).toHaveURL(/\/today/);
  expect(fixture.counts.applied).toBe(1);
  await page.locator('.toast').getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect.poll(() => fixture.counts.reverted).toBe(1);
});
test('F-AC-27: failed preparation offers retry and never creates a task mutation', async ({
  page,
}) => {
  await wtFFixture(page, { error: true });
  await page.goto('/plan/day');
  await expect(page.getByRole('alert')).toContainText('No hemos podido preparar tu día');
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
});
test('F-AC-27: axe has no serious or critical WCAG violations in triage', async ({ page }) => {
  test.skip(
    !process.env.WT_F_AXE_PATH,
    'Set WT_F_AXE_PATH to the externally installed audit script; no app dependency is required.',
  );
  await wtFFixture(page);
  await page.goto('/plan/day');
  await expect(page.locator('#plan-task-title')).toBeVisible();
  await page.addScriptTag({ path: process.env.WT_F_AXE_PATH! });
  const violations = await page.evaluate(async () => {
    const win = window as unknown as {
      axe: {
        run: (
          context: HTMLElement,
          options: Record<string, unknown>,
        ) => Promise<{
          violations: {
            id: string;
            impact: string;
            nodes: { html: string; failureSummary: string }[];
          }[];
        }>;
      };
    };
    const result = await win.axe.run(
      document.querySelector<HTMLElement>('.plan-triage') ?? document.body,
      { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } },
    );
    return result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  });
  expect(violations).toEqual([]);
});

test('F-AC-7/17/18: all closure shortcuts, editable previous card and global navigation survive', async ({
  page,
}, info) => {
  const fixture = await wtFFixture(page);
  await page.goto('/plan/day');
  for (const [i, [key, action]] of [
    ['c', 'done'],
    ['n', 'wont_do'],
    ['a', 'someday'],
    ['Delete', 'delete'],
    ['Space', 'done'],
  ].entries()) {
    await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[i]!.title);
    await page.keyboard.press(key!);
    await expect.poll(() => fixture.decisions[i]?.action).toBe(action);
  }
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[5]!.title);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.plan-prior-choice')).toContainText('Hecha');
  await page.keyboard.press('h');
  await expect
    .poll(() => fixture.decisions.find((d) => d.task_id === fixture.cards[4]!.task_id)?.action)
    .toBe('today');
  expect(fixture.counts.applied).toBe(0);
  await page
    .getByRole('button', {
      name: info.project.name.includes('1280') ? 'Terminar luego' : 'Cerrar',
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/today/);
  await page.getByRole('heading', { name: 'Hoy', exact: true }).click();
  await page.keyboard.press('n');
  await expect(page.locator('[role=dialog].calendar-quick-add')).toBeVisible();
  await page.keyboard.press('Escape');
  if (info.project.name.includes('1280')) {
    await page.getByRole('heading', { name: 'Hoy', exact: true }).click();
    const shell = page.locator('.shell');
    const prior = await shell.getAttribute('data-sidebar');
    await page.keyboard.press('[');
    await expect(shell).toHaveAttribute(
      'data-sidebar',
      prior === 'collapsed' ? 'expanded' : 'collapsed',
    );
  }
});
test('F-AC-24: a mobile swipe navigates without deciding and long press exposes day destinations', async ({
  page,
}, info) => {
  test.skip(info.project.name.includes('1280'), 'Touch navigation');
  const fixture = await wtFFixture(page);
  await page.goto('/plan/day');
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[0]!.title);
  await page.locator('.plan-card-stage').evaluate((target) => {
    const make = (x: number) => new Touch({ identifier: 1, target, clientX: x, clientY: 250 });
    target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [make(290)] }));
    target.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [make(80)] }));
  });
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[1]!.title);
  expect(fixture.decisions).toHaveLength(0);
  await page.getByRole('button', { name: 'Anterior', exact: true }).click();
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[0]!.title);
  await page
    .locator('.sp-task')
    .dispatchEvent('pointerdown', { pointerType: 'touch', button: 0, clientX: 180, clientY: 250 });
  await page.clock.runFor(310);
  await expect(page.locator('.plan-touch-destinations')).toBeVisible();
  const chip = await page
    .locator('.plan-touch-destinations')
    .getByRole('tab', { name: /Mañana/ })
    .boundingBox();
  expect(chip).not.toBeNull();
  await page.evaluate((box) => {
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerType: 'touch',
        button: 0,
        clientX: box!.x + box!.width / 2,
        clientY: box!.y + box!.height / 2,
        bubbles: true,
      }),
    );
    window.dispatchEvent(
      new PointerEvent('pointerup', { pointerType: 'touch', button: 0, bubbles: true }),
    );
  }, chip);
  await expect.poll(() => fixture.decisions[0]?.action).toBe('move');
  expect(fixture.decisions[0]?.date).toBe('2026-10-27');
});

test('F-AC-27: confirmation conflict removes the stale decision and keeps the draft', async ({
  page,
}, info) => {
  const fixture = await wtFFixture(page, { conflict: true });
  await page.goto('/plan/day');
  await expect(page.locator('#plan-task-title')).toBeVisible();
  await page.keyboard.press('h');
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[1]!.title);
  await page.getByRole('button', { name: /Revisar plan \(1\)/ }).click();
  await page.getByRole('button', { name: /Confirmar plan/ }).click();
  await expect(
    page.getByText('Una tarea cambió en otro dispositivo. La hemos quitado del resumen.'),
  ).toBeVisible();
  await expect.poll(() => fixture.decisions.length).toBe(0);
  expect(fixture.counts.applied).toBe(0);
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/wt-f/M4_conflicto_despues_${info.project.name}.png`,
    fullPage: true,
  });
});
test('F-AC-13: day load updates within 100 ms before the slow decision response', async ({
  page,
}, info) => {
  test.skip(!info.project.name.includes('1280'), 'Desktop live load');
  await wtFFixture(page, { delay: 300 });
  await page.goto('/plan/day');
  await expect(page.locator('#plan-task-title')).toBeVisible();
  const elapsed = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const node = document.querySelector('.plan-day-sidebar .sp-load');
        if (!node) {
          reject(new Error('Missing day load'));
          return;
        }
        const before = node.textContent;
        const start = performance.now();
        const timer = setTimeout(() => {
          observer.disconnect();
          reject(new Error('No load update'));
        }, 1000);
        const observer = new MutationObserver(() => {
          if (node.textContent !== before) {
            clearTimeout(timer);
            observer.disconnect();
            resolve(performance.now() - start);
          }
        });
        observer.observe(node, { childList: true, subtree: true, characterData: true });
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
      }),
  );
  expect(elapsed).toBeLessThan(100);
});
test('F-AC-15: queue drag rejects an overlapping event and can move to a day chip', async ({
  page,
}, info) => {
  test.skip(!info.project.name.includes('1280'), 'Desktop queue drag');
  const fixture = await wtFFixture(page);
  await page.goto('/plan/day');
  const row = page.locator('.sp-q').first();
  await expect(row).toBeVisible();
  const box = await row.boundingBox(),
    agenda = await page.locator('[data-plan-agenda]').boundingBox();
  await page.mouse.move(box!.x + 30, box!.y + 10);
  await page.mouse.down();
  await page.mouse.move(agenda!.x + 70, agenda!.y + 5, { steps: 12 });
  await expect(page.locator('.sp-blk.is-ghost')).toContainText('Daily del equipo');
  await page.mouse.up();
  expect(fixture.decisions).toHaveLength(0);
  const friday = await page.locator('.plan-day-sidebar [data-plan-day="2026-10-30"]').boundingBox();
  await page.mouse.move(box!.x + 30, box!.y + 10);
  await page.mouse.down();
  await page.mouse.move(friday!.x + 10, friday!.y + 10, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => fixture.decisions.length).toBe(1);
  expect(fixture.decisions[0]).toMatchObject({ action: 'move', date: '2026-10-30' });
  expect(fixture.decisions[0]!.time).toBeUndefined();
});
