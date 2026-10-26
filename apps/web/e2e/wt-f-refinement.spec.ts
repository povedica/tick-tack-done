import { test, expect } from '@playwright/test';
import { wtFFixture } from './wt-f.fixture';

test('Refinement: task metadata selectors save and keep the current card and plan draft', async ({
  page,
}) => {
  const fixture = await wtFFixture(page);
  const edits: Record<string, unknown>[] = [];
  await page.route('**/api/v1/tasks/**', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[4];
    const card = fixture.cards.find((c) => c.task_id === id)!;
    const patch = route.request().postDataJSON() as Record<string, unknown>;
    edits.push(patch);
    if (patch.priority) card.priority = patch.priority as typeof card.priority;
    if (patch.project_id) card.project_name = 'Lista sintética';
    if ('repeat_rule' in patch) card.repeat_rule = patch.repeat_rule as string;
    await route.fulfill({ json: { id, title: card.title, status: 'active' } });
  });
  await page.goto('/plan/day');
  await expect(page.locator('#plan-task-title')).toBeVisible();
  await page.getByRole('button', { name: 'Cambiar prioridad', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Alta', exact: true }).click();
  await expect.poll(() => edits.length).toBe(1);
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[0]!.title);
  await expect(page.locator('.plan-triage')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Cambiar de lista', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Lista sintética' }).click();
  await expect(page.locator('.sp-task .sp-proj:visible')).toContainText('Lista sintética');
  await expect(page.locator('.plan-triage')).toHaveAttribute('aria-busy', 'false');
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Configurar recurrencia' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Cada día', exact: true })).toBeVisible();
  await expect(dialog.locator('.cal-grid')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cada día', exact: true }).click();
  await dialog.getByRole('button', { name: 'Hecho', exact: true }).click();
  await expect.poll(() => edits.length).toBe(3);
  expect(edits[2]).toEqual({ repeat_rule: 'RRULE:FREQ=DAILY' });
  await expect(page.locator('.sp-task .plan-repeat')).toContainText('Cada día');
  expect(fixture.counts.applied).toBe(0);
});

test('Refinement: queue can be grouped and hidden; agenda can be resized with keys', async ({
  page,
}, info) => {
  test.skip(!info.project.name.includes('1280'), 'Desktop panels');
  const fixture = await wtFFixture(page);
  fixture.cards[0]!.tags = [
    ...fixture.cards[0]!.tags,
    { id: 'extra-tag', name: 'etiqueta adicional', color: null },
  ];
  await page.goto('/plan/day');
  await expect(page.locator('#plan-task-title')).toBeVisible();
  await expect(page.locator('.sp-q').first()).toContainText('Casa');
  await expect(page.locator('.sp-q').first()).toContainText('vacaciones');
  await page.getByRole('combobox', { name: 'Agrupar por' }).selectOption('list');
  await expect(page.locator('.plan-queue-scroll h3')).toHaveText(['Casa', 'Personal']);
  await expect(
    page.locator('.sp-queue').getByRole('button', { name: 'Ocultar tareas' }),
  ).toBeVisible();
  await expect(page.locator('.sp-q').first().locator('.ui-tag')).toHaveText([
    'vacaciones',
    'contratos',
  ]);
  await expect(page.locator('.sp-q').first()).not.toContainText('#vacaciones');
  await page.getByRole('button', { name: 'Ocultar tareas' }).click();
  await expect(page.locator('.sp-queue')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mostrar tareas' }).click();
  await expect(page.locator('.sp-queue')).toBeVisible();
  const handle = page.getByRole('separator', { name: 'Ajustar ancho de la agenda' });
  await handle.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', '340');
  await expect(page.locator('.sp-q.is-current')).toContainText('Revisar contrato');
  const first = page.locator('.sp-q').filter({ hasText: fixture.cards[0]!.title });
  await expect(first.locator('.plan-queue-check.is-completed')).toHaveCount(0);
  await page.locator('#plan-task-title').focus();
  await page.keyboard.press('h');
  await expect.poll(() => fixture.decisions[0]?.action).toBe('today');
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[1]!.title);
  await expect(first.locator('.plan-queue-check.is-completed')).toHaveCount(1);
  await expect(first).toBeDisabled();
  await page.keyboard.press('Control+z');
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[0]!.title);
  await page.keyboard.press('c');
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[1]!.title);
  await expect(first.locator('.plan-queue-check.is-completed')).toHaveCount(1);
  await expect(first).toBeDisabled();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[1]!.title);
  expect(fixture.decisions).toHaveLength(1);
  expect(fixture.decisions[0]?.action).toBe('done');
  await page.evaluate(
    (theme) => document.documentElement.setAttribute('data-theme', theme),
    info.project.name.endsWith('dark') ? 'dark' : 'light',
  );
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/wt-f/refinement_queue_${info.project.name}.png`,
    fullPage: true,
  });
});

test('Refinement: personal time extends to midnight on working days and weekends', async ({
  page,
}, info) => {
  await wtFFixture(page);
  await page.goto('/plan/day');
  await expect(page.locator('#plan-task-title')).toBeVisible();
  await page.keyboard.press('o');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: /mar 27/ }).click();
  await dialog.getByRole('combobox', { name: 'Hora (opcional)' }).selectOption('23:30');
  await dialog.getByRole('button', { name: /Planificar el/ }).click();
  await expect(page.locator('#plan-task-title')).toHaveText('Revisión semanal y plan de la semana');
  await page.keyboard.press('o');
  for (let i = 0; i < 4; i++)
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Día siguiente', exact: true })
      .click();
  await page
    .getByRole('dialog')
    .getByRole('combobox', { name: 'Hora (opcional)' })
    .selectOption('22:00');
  await page.keyboard.press('Escape');
  if (info.project.name.includes('1280')) {
    await expect(page.locator('[data-plan-agenda]')).toHaveAttribute('data-plan-end', '1440');
    await expect(
      page.locator('.plan-day-sidebar').getByRole('tab', { name: /Mañana/ }),
    ).toHaveCount(0);
  }
  await page.evaluate(
    (theme) => document.documentElement.setAttribute('data-theme', theme),
    info.project.name.endsWith('dark') ? 'dark' : 'light',
  );
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/wt-f/refinement_${info.project.name}.png`,
    fullPage: true,
  });
});

test('Refinement: compact action menu stays visible and schedules without applying', async ({
  page,
}) => {
  const fixture = await wtFFixture(page);
  await page.goto('/plan/day');
  await expect(page.locator('#plan-task-title')).toBeVisible();
  await page.getByRole('button', { name: 'Acciones', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Algún día', exact: true }).click();
  await expect.poll(() => fixture.decisions[0]?.action).toBe('someday');
  expect(fixture.counts.applied).toBe(0);
});

test('Refinement: drag to 23:30 uses the personal-day range and displays a floating preview', async ({
  page,
}, info) => {
  test.skip(!info.project.name.includes('1280'), 'Desktop agenda');
  const fixture = await wtFFixture(page);
  await page.goto('/plan/day');
  await expect(page.locator('#plan-task-title')).toBeVisible();
  await page.locator('.sp-grip').scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.locator('.plan-agenda-scroll').evaluate((node) => node.scrollTop))
    .toBeGreaterThan(0);
  await page.locator('.plan-agenda-scroll').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  const agenda = (await page.locator('[data-plan-agenda]').boundingBox())!;
  const grip = (await page.locator('.sp-grip').boundingBox())!;
  await page.mouse.move(grip.x + 8, grip.y + 8);
  await page.mouse.down();
  await page.mouse.move(agenda.x + 60, agenda.y + (agenda.height * 23.5) / 24, { steps: 12 });
  await expect(page.locator('.plan-drag-preview')).toContainText(fixture.cards[0]!.title);
  await expect(page.locator('.sp-blk.is-ghost')).toContainText('23:30');
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/wt-f/refinement_drag_${info.project.name}.png`,
  });
  await page.mouse.up();
  await expect.poll(() => fixture.decisions[0]?.time).toBe('23:30');
});

test('Refinement: mobile card fits without scrolling and navigation skips decided tasks', async ({
  page,
}, info) => {
  test.skip(info.project.name.includes('1280'), 'Mobile card');
  const fixture = await wtFFixture(page);
  await page.goto('/plan/day');
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[0]!.title);
  const fit = async () => {
    expect(
      await page
        .locator('.plan-triage')
        .evaluate((node) => node.scrollHeight <= node.clientHeight + 1),
    ).toBe(true);
    const card = (await page.locator('.sp-task').boundingBox())!;
    const footer = (await page.locator('.plan-mobile-footer').boundingBox())!;
    expect(card.y + card.height).toBeLessThanOrEqual(footer.y + 1);
    await expect(page.getByRole('button', { name: 'Acciones', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: /Adjuntos/ })).toBeInViewport();
    for (const action of ['Hecha', 'Hoy', 'Mañana', 'Otro día', 'No lo haré'])
      await expect(
        page
          .getByRole('navigation', { name: 'Acciones' })
          .getByRole('button', { name: action, exact: true }),
      ).toBeInViewport({ ratio: 1 });
  };
  await fit();
  await page.getByRole('button', { name: 'Ver más', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Cláusula 7');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Cerrar|Close/ })
    .click();
  const swipe = async (from: number, to: number) => {
    await page.locator('.plan-card-stage').evaluate(
      (target, points) => {
        const make = (x: number) => new Touch({ identifier: 1, target, clientX: x, clientY: 240 });
        target.dispatchEvent(
          new TouchEvent('touchstart', { bubbles: true, touches: [make(points[0]!)] }),
        );
        target.dispatchEvent(
          new TouchEvent('touchmove', {
            bubbles: true,
            touches: [make((points[0]! + points[1]!) / 2)],
          }),
        );
        target.dispatchEvent(
          new TouchEvent('touchend', { bubbles: true, changedTouches: [make(points[1]!)] }),
        );
      },
      [from, to],
    );
  };
  await swipe(280, 60);
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[1]!.title);
  await page
    .getByRole('navigation', { name: 'Acciones' })
    .getByRole('button', { name: 'Hoy', exact: true })
    .click();
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[2]!.title);
  await swipe(60, 280);
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[0]!.title);
  expect(fixture.decisions).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Anterior', exact: true })).toBeDisabled();
  await fit();
  await swipe(280, 60);
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[2]!.title);
  await page.getByRole('button', { name: 'Anterior', exact: true }).click();
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[0]!.title);
  await expect
    .poll(() =>
      page
        .locator('.plan-card-motion')
        .evaluate((node) =>
          node.getAnimations().every((animation) => animation.playState === 'finished'),
        ),
    )
    .toBe(true);
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/wt-f/refinement_fitted_${info.project.name}.png`,
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await fit();
});

test('Refinement: carousel shows real neighboring cards and moves them together', async ({
  page,
}, info) => {
  test.skip(info.project.name.includes('1280'), 'Mobile carousel');
  const fixture = await wtFFixture(page);
  await page.goto('/plan/day');
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[0]!.title);
  await page.evaluate(
    (theme) => document.documentElement.setAttribute('data-theme', theme),
    info.project.name.endsWith('dark') ? 'dark' : 'light',
  );
  const next = page.locator('.plan-neighbor.is-next');
  await expect(next).toContainText(fixture.cards[1]!.title);
  await expect(next).toHaveAttribute('inert', '');
  const currentBox = (await page.locator('.sp-task').boundingBox())!;
  const neighborBox = (await next.boundingBox())!;
  expect(neighborBox.x - currentBox.x - currentBox.width).toBeCloseTo(12, 0);
  await page.locator('.plan-card-stage').evaluate((target) => {
    const make = (x: number) => new Touch({ identifier: 1, target, clientX: x, clientY: 250 });
    target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [make(290)] }));
    target.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [make(150)] }));
  });
  const movedCurrent = (await page.locator('.sp-task').boundingBox())!;
  const movedNeighbor = (await next.boundingBox())!;
  expect(currentBox.x - movedCurrent.x).toBeCloseTo(140, 0);
  expect(neighborBox.x - movedNeighbor.x).toBeCloseTo(140, 0);
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/wt-f/refinement_carousel_drag_${info.project.name}.png`,
  });
  await page.locator('.plan-card-stage').evaluate((target) => {
    target.dispatchEvent(
      new TouchEvent('touchend', {
        bubbles: true,
        changedTouches: [new Touch({ identifier: 1, target, clientX: 150, clientY: 250 })],
      }),
    );
  });
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[1]!.title);
  await expect(page.locator('.plan-neighbor.is-previous')).toContainText(fixture.cards[0]!.title);
  expect(fixture.decisions).toHaveLength(0);
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/wt-f/refinement_carousel_${info.project.name}.png`,
  });
});

test('Refinement: planning overlays have a consistent header, close action and styled recurrence controls', async ({
  page,
}, info) => {
  const fixture = await wtFFixture(page);
  fixture.cards[1]!.repeat_rule = 'RRULE:FREQ=WEEKLY';
  await page.goto('/plan/day');
  await expect(page.locator('#plan-task-title')).toBeVisible();
  await page.evaluate(
    (theme) => document.documentElement.setAttribute('data-theme', theme),
    info.project.name.endsWith('dark') ? 'dark' : 'light',
  );
  for (const label of [
    'Cambiar de lista',
    'Cambiar prioridad',
    'Acciones',
    ...(info.project.name.includes('1280') ? ['Añadir tareas'] : []),
  ]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.popover-heading')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  await page.keyboard.press('o');
  await expect(page.getByRole('dialog').getByRole('heading', { name: '¿Cuándo?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[1]!.title);
  await page.getByRole('button', { name: 'Configurar recurrencia', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Cada semana', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(dialog.locator('.repeat-presets')).toBeVisible();
  await expect(dialog.locator('.repeat-interval')).toHaveCount(2);
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  if (process.env.WT_F_AXE_PATH) {
    await page.addScriptTag({ path: process.env.WT_F_AXE_PATH });
    const violations = await dialog.evaluate(async (node) => {
      const win = window as unknown as {
        axe: {
          run: (node: Element, options: object) => Promise<{ violations: { impact: string }[] }>;
        };
      };
      return (
        await win.axe.run(node, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })
      ).violations.filter((item) => item.impact === 'serious' || item.impact === 'critical');
    });
    expect(violations).toEqual([]);
  }
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/wt-f/refinement_overlay_repeat_${info.project.name}.png`,
  });
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  expect(fixture.decisions).toHaveLength(0);
});

test('Refinement: schedule CTA saves once, advances, keeps other choices draft and supports undo', async ({
  page,
}, info) => {
  const fixture = await wtFFixture(page);
  await page.goto('/plan/day');
  await expect(page.locator('#plan-task-title')).toBeVisible();
  await page.keyboard.press('h');
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[1]!.title);
  await page.keyboard.press('o');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: /jue 29/ }).click();
  await dialog.getByRole('combobox', { name: 'Hora (opcional)' }).selectOption('18:00');
  await expect(dialog.getByRole('radio', { name: '45 min', exact: true })).toHaveCount(0);
  const other = dialog.getByRole('radio', { name: 'Otra', exact: true });
  const first = dialog.getByRole('radio', { name: '15 min', exact: true });
  const boxes = await Promise.all([other.boundingBox(), first.boundingBox()]);
  expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(2);
  await page.evaluate(
    (theme) => document.documentElement.setAttribute('data-theme', theme),
    info.project.name.endsWith('dark') ? 'dark' : 'light',
  );
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/wt-f/schedule_cta_${info.project.name}.png`,
    fullPage: true,
  });
  const request = page.waitForRequest(
    (r) => r.url().includes('/schedule/') && r.method() === 'POST',
  );
  await dialog.getByRole('button', { name: /Planificar el/ }).click();
  expect((await request).postDataJSON()).toMatchObject({
    action: 'move',
    date: '2026-10-29',
    time: '18:00',
    duration: 30,
  });
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[2]!.title);
  expect(fixture.counts.scheduled).toBe(1);
  expect(fixture.counts.applied).toBe(0);
  expect(fixture.decisions).toHaveLength(2);
  await page.keyboard.press('Control+z');
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[1]!.title);
  expect(fixture.counts.reverted).toBe(1);
  expect(fixture.decisions).toHaveLength(1);
});

test('Refinement: ordinary and zero-duration recurring drops are saved and stay checked after reload', async ({
  page,
}, info) => {
  test.skip(!info.project.name.includes('1280'), 'Desktop drag');
  const fixture = await wtFFixture(page, { zeroRecurring: true });
  await page.goto('/plan/day');
  for (const [i, hour] of [
    [0, 23],
    [1, 23.5],
  ] as const) {
    await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[i]!.title);
    await expect(page.getByRole('radio', { name: '30 min', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.locator('.plan-agenda-scroll').evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    const grid = (await page.locator('[data-plan-agenda]').boundingBox())!;
    const grip = (await page.locator('.sp-grip').boundingBox())!;
    await page.mouse.move(grip.x + 8, grip.y + 8);
    await page.mouse.down();
    await page.mouse.move(grid.x + 50, grid.y + (grid.height * hour) / 24, { steps: 12 });
    await expect(page.locator('.sp-blk.is-ghost')).toBeVisible();
    await page.mouse.up();
    await expect.poll(() => fixture.counts.scheduled).toBe(i + 1);
    const row = page
      .getByTitle(fixture.cards[i]!.title, { exact: true })
      .filter({ has: page.locator('.plan-queue-check') });
    await expect(row).toBeDisabled();
    await expect(row.locator('.plan-queue-check.is-completed')).toHaveCount(1);
    await expect(row).toHaveClass(/is-planned/);
  }
  expect(fixture.counts.applied).toBe(0);
  await page.reload();
  await expect(page.locator('#plan-task-title')).toHaveText(fixture.cards[2]!.title);
  for (const card of fixture.cards.slice(0, 2)) {
    const row = page.locator('.sp-q').filter({ hasText: card.title });
    await expect(row).toBeDisabled();
    await expect(row.locator('.plan-queue-check.is-completed')).toHaveCount(1);
  }
  await page.locator('.sp-q.is-planned').last().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/wt-f/planned_after_reload_${info.project.name}.png`,
    fullPage: true,
  });
});
