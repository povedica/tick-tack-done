import { test, expect } from '@playwright/test';
import { habitsDesignFixture } from './habits-design.fixture';
for (const count of [0, 1, 3, 8])
  test(`Habits visual ${count}`, async ({ page }, info) => {
    await habitsDesignFixture(page, count);
    await page.goto('/habits');
    await expect(page.getByRole('heading', { name: 'Hábitos', exact: true })).toBeVisible();
    await page.evaluate(
      (theme) => document.documentElement.setAttribute('data-theme', theme),
      info.project.name.endsWith('dark') ? 'dark' : 'light',
    );
    if (count > 0 && process.env.HABITS_PHASE !== 'before') {
      await expect(page.locator('.habit-card-metrics').first()).toContainText('2 días');
      await expect(page.locator('.habit-constancy .stats-heatmap')).toBeVisible();
    }
    await page.screenshot({
      animations: 'disabled',
      path: `../../test-artifacts/audit/evidencias/habits/${process.env.HABITS_PHASE ?? 'after'}_list_${count}_${info.project.name}.png`,
      fullPage: false,
    });
    if (count > 0 && process.env.HABITS_PHASE !== 'before') {
      await page.locator('.habit-constancy').scrollIntoViewIfNeeded();
      await page.screenshot({
        animations: 'disabled',
        path: `../../test-artifacts/audit/evidencias/habits/r3_after_constancy_${String(count)}_${info.project.name}.png`,
      });
      await page.getByRole('heading', { name: 'Hábitos', exact: true }).scrollIntoViewIfNeeded();
    }
    if (count === 3) {
      await page
        .getByRole('button', { name: /Crear hábito|Nuevo hábito/, exact: true })
        .first()
        .click();
      await page.screenshot({
        animations: 'disabled',
        path: `../../test-artifacts/audit/evidencias/habits/${process.env.HABITS_PHASE ?? 'after'}_form_${info.project.name}.png`,
        fullPage: false,
      });
    }
  });

test('Form fits SE without scrolling in every option and creates with name plus Enter', async ({
  page,
}, info) => {
  const f = await habitsDesignFixture(page, 0);
  await page.goto('/habits');
  await page.getByRole('button', { name: 'Nuevo hábito', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo hábito' });
  const name = dialog.getByRole('textbox', { name: 'Nombre', exact: true });
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('name', 'habit-title');
  await expect(name).toHaveAttribute('autocomplete', 'off');
  await expect(name).toHaveAttribute('data-lpignore', 'true');
  const fits = async () => {
    expect(await dialog.evaluate((e) => e.scrollHeight <= e.clientHeight + 1)).toBe(true);
    const box = (await dialog.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
    await expect(dialog.getByRole('button', { name: 'Guardar', exact: true })).toBeInViewport();
  };
  await fits();
  expect(
    await dialog.locator('.habit-editor-fields').evaluate((e) => e.scrollHeight - e.clientHeight),
  ).toBeLessThanOrEqual(1);
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Escribe un nombre.');
  expect(f.calls).toHaveLength(0);
  await name.fill('Beber agua');
  await dialog.getByRole('button', { name: 'Días concretos', exact: true }).click();
  await expect(dialog.locator('.habit-day-check')).toHaveCount(7);
  await dialog.getByRole('button', { name: 'lunes', exact: true }).click();
  await expect(dialog.locator('.habit-day-check')).toHaveCount(6);
  await dialog.getByRole('button', { name: 'Alcanzar una cantidad', exact: true }).click();
  await dialog.getByRole('button', { name: '+ Añadir hora', exact: true }).click();
  await fits();
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/habits/r3_after_form_quantity_${info.project.name}.png`,
  });
  await dialog.getByRole('button', { name: 'Más', exact: true }).click();
  await fits();
  await expect(name).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Más', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await dialog.getByRole('button', { name: /Fecha de inicio/ }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: /Fecha de inicio/ })).toBeVisible();
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/habits/r3_after_form_more_${info.project.name}.png`,
  });
  await dialog.getByRole('button', { name: 'Más', exact: true }).click();
  await dialog.getByRole('button', { name: 'X por semana', exact: true }).click();
  await fits();
  await dialog.getByRole('button', { name: 'Cada día', exact: true }).click();
  await dialog.getByRole('button', { name: 'Hecho / no hecho', exact: true }).click();
  await dialog.getByRole('button', { name: 'Quitar hora', exact: true }).click();
  await name.press('Enter');
  await expect(dialog).toHaveCount(0);
  expect(f.calls.filter((c) => c.path === '/habits')).toHaveLength(1);
  expect(f.calls.find((c) => c.path === '/habits')?.body).toMatchObject({
    name: 'Beber agua',
    goal: { period: 'day', times_per_period: 1, target_count: 1 },
  });
  expect(f.calls.at(-1)?.body).not.toHaveProperty('icon');
});
test('One tap marks and unmarks, weekly progress updates, and a past day can be corrected', async ({
  page,
}, info) => {
  const f = await habitsDesignFixture(page, 3);
  await page.goto('/habits');
  const card = page
    .locator('.habit-card-v2')
    .filter({ has: page.getByRole('link', { name: 'Leer un rato · Ver detalle', exact: true }) });
  await expect(card).toHaveClass(/is-met/);
  await card.locator('.habit-week-points .is-today').click();
  await expect(card).not.toHaveClass(/is-met/);
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/habits/r3_after_unmarked_${info.project.name}.png`,
  });
  await card.locator('.habit-week-points .is-today').click();
  await expect(card).toHaveClass(/is-met/);
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/habits/r3_after_marked_${info.project.name}.png`,
  });
  await card.getByRole('button', { name: /martes,? 27 oct.*Leer un rato/ }).click();
  expect(f.calls.at(-1)?.body).toMatchObject({ date: '2026-10-27', count: 0 });
  const water = page
    .locator('.habit-card-v2')
    .filter({ has: page.getByRole('link', { name: 'Beber agua · Ver detalle', exact: true }) });
  await expect(water).toContainText('Objetivo 2 / 7');
  await expect(
    water.getByRole('button', { name: /Aumentar cantidad|Reducir cantidad/ }),
  ).toHaveCount(0);
  await water.locator('.habit-week-points .is-today').click();
  await expect(water).toContainText('Objetivo 3 / 7');
  await expect(water).toHaveClass(/is-met/);
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/habits/r3_after_quantity_${info.project.name}.png`,
  });
  await expect(page.getByRole('textbox', { name: 'Nota (opcional)' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Editar hábitos', exact: true }).click();
  const row = page.locator('.habit-management-list li').filter({ hasText: 'Beber agua' });
  await row.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(row).toContainText('En pausa');
  await row.getByRole('button', { name: 'Reanudar', exact: true }).click();
  await expect(row).not.toContainText('En pausa');
  const beforeDelete = f.calls.length;
  await row.getByRole('button', { name: 'Eliminar', exact: true }).click();
  const confirmation = row.getByRole('alertdialog');
  await expect(confirmation).toContainText('todo el historial');
  expect(f.calls).toHaveLength(beforeDelete);
  await confirmation.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(row).toHaveCount(0);
});

test('Layout geometry and Constancia remain accessible without page overflow', async ({
  page,
}, info) => {
  await habitsDesignFixture(page, 3);
  await page.goto('/habits');
  const section = page.getByRole('region', { name: 'Constancia' });
  await expect(section.locator('.stats-heatmap')).toBeVisible();
  expect(
    await section.locator('.stats-heatmap-wrap').evaluate((e) => e.scrollWidth - e.clientWidth),
  )[page.viewportSize()!.width <= 768 ? 'toBeGreaterThan' : 'toBeLessThanOrEqual'](1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  const circle = page.locator('.habit-week-points i').first();
  const box = (await circle.boundingBox())!;
  expect(box.width).toBe(box.height);
  await section.getByRole('combobox', { name: 'Hábito', exact: true }).selectOption('');
  await section.locator('[data-date="2026-10-28"]').click();
  await expect(section.locator('.heatmap-selection')).toContainText('3 de 3');
  await section.getByRole('combobox', { name: 'Hábito', exact: true }).selectOption('habit-0');
  await section.locator('[data-date="2026-10-29"]').click();
  await expect(section.locator('.heatmap-selection')).toContainText('0 de 1');
  await expect(section.locator('.heatmap-selection')).toContainText('Beber agua');
  await expect(section.locator('[data-date="2026-09-30"]')).toHaveAttribute(
    'data-state',
    'inactive',
  );
  expect(
    await section
      .locator('.heatmap-accessible-table')
      .evaluate((e) => e.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/habits/r3_after_constancy_${info.project.name}.png`,
  });
});

test('Two touches create a default habit; Esc closes and nested date picker stays in editor', async ({
  page,
}) => {
  const f = await habitsDesignFixture(page, 0);
  await page.goto('/habits');
  await page.getByRole('button', { name: 'Nuevo hábito', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo hábito' });
  await dialog.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Leer');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(f.calls).toHaveLength(1);
  await page.getByRole('button', { name: 'Nuevo hábito', exact: true }).first().click();
  await dialog.getByRole('button', { name: 'Más', exact: true }).click();
  await dialog.getByRole('button', { name: /Fecha de inicio/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Guardar', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('Clear habit controls, scalable selection and monthly completion calendar', async ({
  page,
}, info) => {
  await habitsDesignFixture(page, 8);
  await page.goto('/habits');
  await expect(page.getByRole('button', { name: 'Gestionar', exact: true })).toHaveCount(0);
  const water = page
    .locator('.habit-card-v2')
    .filter({ has: page.getByRole('link', { name: 'Beber agua · Ver detalle', exact: true }) });
  await expect(water.locator('.habit-week-points .is-today')).toBeVisible();
  await expect(water.locator('.habit-card-quantity')).toHaveCount(0);
  await expect(water.locator('.habit-card-metrics .lucide-flame')).toBeVisible();
  await expect(page.getByRole('button', { name: /Elegir semana,/ })).toBeVisible();
  await page.getByRole('button', { name: 'Semana anterior', exact: true }).click();
  await expect(page.getByRole('button', { name: /Elegir semana,/ })).toContainText('19 oct');
  await page.getByRole('button', { name: 'Semana actual', exact: true }).click();
  await expect(page.getByRole('button', { name: /Elegir semana,/ })).toContainText('26 oct');
  await water.getByRole('button', { name: 'Ver mes', exact: true }).click();
  const calendar = page.getByRole('region', { name: 'Calendario de cumplimiento · Beber agua' });
  await expect(calendar).toBeVisible();
  await expect(calendar.locator('[data-met="true"]')).toHaveCount(2);
  await expect(calendar.locator('[data-today="true"]')).toHaveCount(1);
  await expect(calendar).toContainText('octubre de 2026');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  if (page.viewportSize()!.width < 769) {
    const dialog = page.getByRole('dialog', { name: 'Calendario de cumplimiento · Beber agua' });
    await expect(dialog).toBeInViewport();
    await page.screenshot({
      animations: 'disabled',
      path: `../../test-artifacts/audit/evidencias/habits/r3_after_month_${info.project.name}.png`,
    });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  } else {
    await page.screenshot({
      animations: 'disabled',
      path: `../../test-artifacts/audit/evidencias/habits/r3_after_month_${info.project.name}.png`,
    });
    await water.getByRole('button', { name: 'Ocultar mes', exact: true }).click();
  }
  const constancy = page.getByRole('region', { name: 'Constancia', exact: true });
  const select = constancy.getByRole('combobox', { name: 'Hábito', exact: true });
  await expect(select.locator('option')).toHaveCount(9);
  await select.selectOption('habit-7');
  await expect(select).toHaveValue('habit-7');
  await expect(constancy.locator('.habit-constancy-filters')).toHaveCount(0);
  await page.getByRole('button', { name: 'Editar hábitos', exact: true }).click();
  const manager = page.getByRole('dialog', { name: 'Tus hábitos', exact: true });
  await expect(manager).toBeVisible();
  await expect(manager.getByRole('button', { name: 'Archivar', exact: true })).toHaveCount(0);
  const firstActions = manager.locator('.habit-action-group').first();
  await expect(firstActions.getByRole('button')).toHaveText(['Editar', 'Pausar', 'Eliminar']);
  expect(
    (await firstActions.getByRole('button').first().boundingBox())!.height,
  ).toBeLessThanOrEqual(32);
  await expect(page.locator('.habit-cards-v2')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(manager).toHaveCount(0);
});

test('R2: shared surfaces and visible status circles', async ({ page }) => {
  await habitsDesignFixture(page, 3);
  await page.goto('/habits');
  const cards = page.locator('.habit-card-v2');
  const plain = await cards.first().evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(await cards.nth(1).evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(plain);
  const circle = cards.first().locator('.habit-week-points i').first();
  const box = (await circle.boundingBox())!;
  expect(box.width).toBe(box.height);
  expect(box.width).toBeGreaterThanOrEqual(28);
  await expect(cards.nth(1).locator('.is-done i .lucide-check').first()).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await cards
      .nth(1)
      .locator('.habit-week-points .is-today i')
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe('none');
  await cards.first().getByRole('button', { name: 'Ver mes', exact: true }).click();
  const marked = page.locator('.habit-month-day[data-met="true"]').first();
  expect(await marked.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(
    await cards
      .nth(1)
      .locator('.habit-week-points .is-today i')
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  );
  await expect(marked.locator('.lucide-check')).toBeVisible();
});

test('R3: compact habit, weekly summary, mobile month scroll and a usable detail with a way back', async ({
  page,
}, info) => {
  await habitsDesignFixture(page, 3);
  await page.goto('/habits');
  const water = page.locator('.habit-card-v2').first();
  await expect(water).toContainText('Objetivo 2 / 7');
  expect((await water.boundingBox())!.height).toBeLessThan(155);
  const heatmap = page.locator('.habit-constancy .year-heatmap');
  if (page.viewportSize()!.width <= 768) {
    await expect(heatmap).toHaveClass(/is-months/);
    const sizes = await heatmap.evaluate((e) => ({
      full: e.scrollWidth,
      view: e.clientWidth,
      left: e.scrollLeft,
    }));
    expect(sizes.full).toBeGreaterThan(sizes.view * 2);
    expect(sizes.left).toBeGreaterThan(0);
    await heatmap.evaluate((e) => {
      e.scrollLeft = 0;
    });
    expect(await heatmap.evaluate((e) => e.scrollLeft)).toBe(0);
    const mon = heatmap.locator('[data-date="2026-10-26"]');
    const tue = heatmap.locator('[data-date="2026-10-27"]');
    expect(Number(await tue.getAttribute('x'))).toBeGreaterThan(
      Number(await mon.getAttribute('x')),
    );
    expect(await tue.getAttribute('y')).toBe(await mon.getAttribute('y'));
  }
  await water.getByRole('link', { name: 'Beber agua · Ver detalle', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Beber agua', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver a hábitos', exact: true })).toBeVisible();
  await expect(page.locator('.habit-detail-metrics > div')).toHaveCount(4);
  await expect(page.locator('.habit-detail-calendar')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/habits/r3_detail_${info.project.name}.png`,
  });
  await page.getByRole('link', { name: 'Volver a hábitos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hábitos', exact: true })).toBeVisible();
});

test('R4: weekly target, scheduled days, and centered circle numbers', async ({ page }) => {
  const fixture = await habitsDesignFixture(page, 3);
  fixture.habits[0]!.goal = { period: 'week', target_count: 8, times_per_period: 3 };
  await page.goto('/habits');
  const water = page.locator('.habit-card-v2').first();
  await expect(water).toContainText('Objetivo 2 / 3');
  await expect(page.locator('.habit-card-v2').nth(2)).toContainText('Objetivo 2 / 5');
  const number = water.locator('i .habit-week-date').last();
  const circle = number.locator('..');
  const n = (await number.boundingBox())!;
  const c = (await circle.boundingBox())!;
  expect(Math.abs(n.x + n.width / 2 - c.x - c.width / 2)).toBeLessThan(1);
  expect(Math.abs(n.y + n.height / 2 - c.y - c.height / 2)).toBeLessThan(1);
});

test('R5: no redundant check, aligned metadata and clear weekday labels', async ({ page }) => {
  await habitsDesignFixture(page, 3);
  await page.goto('/habits');
  const card = page.locator('.habit-card-v2').first();
  await expect(card.locator('.habit-today-check')).toHaveCount(0);
  await expect(card.locator('.habit-card-progress')).toHaveAttribute(
    'aria-label',
    'Objetivo: 2 / 7',
  );
  const labels = card.locator('.habit-week-points button > span');
  await expect(labels).toHaveText(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']);
  const streak = (await card.locator('.habit-card-metrics').boundingBox())!;
  const progress = (await card.locator('.habit-card-progress').boundingBox())!;
  expect(Math.abs(streak.y - progress.y)).toBeLessThan(1);
  expect(progress.x - streak.x - streak.width).toBeGreaterThanOrEqual(15);
  const label = (await labels.first().boundingBox())!;
  const circle = (await card.locator('.habit-week-points i').first().boundingBox())!;
  expect(circle.y - label.y - label.height).toBeGreaterThanOrEqual(7);
});

test('R6: compact management and explicit objective', async ({ page }, info) => {
  await habitsDesignFixture(page, 1);
  await page.goto('/habits');
  await expect(page.locator('.habit-card-progress')).toHaveText('Objetivo 2 / 7');
  await expect(page.locator('.habit-card-progress .lucide-target')).toBeVisible();
  await page.getByRole('button', { name: 'Editar hábitos', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Tus hábitos', exact: true });
  await expect(dialog.locator('.habit-action-group button')).toHaveText([
    'Editar',
    'Pausar',
    'Eliminar',
  ]);
  expect(
    (await dialog.locator('.habit-action-group button').first().boundingBox())!.height,
  ).toBeLessThanOrEqual(32);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/habits/r6_manager_${info.project.name}.png`,
  });
});

test('R6: existing archived habits resume with their records intact', async ({ page }) => {
  const fixture = await habitsDesignFixture(page, 1);
  fixture.habits[0]!.archived = true;
  await page.goto('/habits');
  await page.getByRole('button', { name: 'Editar hábitos', exact: true }).click();
  const row = page.locator('.habit-management-list li').first();
  await expect(row).toContainText('En pausa');
  await row.getByRole('button', { name: 'Reanudar', exact: true }).click();
  await expect(row).not.toContainText('En pausa');
  expect(fixture.calls.at(-1)?.body).toMatchObject({ archived: false, paused: false });
  expect(fixture.habits[0]!.today.count).toBe(5);
  await expect(page.locator('.habit-card-v2').first()).toContainText('Objetivo 2 / 7');
});

test('R7: January to December, desktop weekday column and gaps between months', async ({
  page,
}, info) => {
  await habitsDesignFixture(page, 3);
  await page.goto('/habits');
  const map = page.locator('.habit-constancy .stats-heatmap');
  await expect(map.locator('rect[data-date="2026-01-01"]')).toHaveCount(1);
  await expect(map.locator('rect[data-date="2026-12-31"]')).toHaveCount(1);
  await expect(map.locator('rect')).toHaveCount(365);
  if (page.viewportSize()!.width > 768) {
    const weekdays = map.locator('.heatmap-weekday-labels text');
    await expect(weekdays).toHaveText(['L', 'M', 'M', 'J', 'V', 'S', 'D']);
    await expect(map.locator('.heatmap-month-label')).toHaveCount(12);
    await expect(map.locator('.heatmap-month-label').first()).toHaveText('ene');
    const jan31 = map.locator('[data-date="2026-01-31"]');
    const feb1 = map.locator('[data-date="2026-02-01"]');
    expect(
      Number(await feb1.getAttribute('x')) -
        Number(await jan31.getAttribute('x')) -
        Number(await jan31.getAttribute('width')),
    ).toBeGreaterThanOrEqual(8);
    expect(
      await page.locator('.year-heatmap').evaluate((e) => e.scrollWidth - e.clientWidth),
    ).toBeLessThanOrEqual(1);
  }
  await map.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `../../test-artifacts/audit/evidencias/habits/r7_heatmap_${info.project.name}.png`,
  });
});

test('R8: habit name and detail hint share one destination', async ({ page }) => {
  await habitsDesignFixture(page, 1);
  await page.goto('/habits');
  const link = page.getByRole('link', { name: 'Beber agua · Ver detalle', exact: true });
  await expect(link).toHaveAttribute('href', '/habits/habit-0');
  await expect(link.getByText('Ver detalle', { exact: true })).toBeVisible();
  await link.getByText('Ver detalle', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Beber agua', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Volver a hábitos', exact: true }).click();
  await page
    .getByRole('link', { name: 'Beber agua · Ver detalle', exact: true })
    .getByText('Beber agua', { exact: true })
    .click();
  await expect(page).toHaveURL(/\/habits\/habit-0$/);
});

test('R9: detail shows the current weekly goal even while browsing another month', async ({
  page,
}) => {
  const fixture = await habitsDesignFixture(page, 1);
  fixture.habits[0]!.goal = { period: 'week', target_count: 8, times_per_period: 3 };
  await page.goto('/habits/habit-0');
  const metric = page.locator('.habit-detail-metrics > div').first();
  await expect(metric).toContainText('Objetivo semana');
  await expect(metric.locator('strong')).toHaveText('2 / 3');
  await expect(page.getByText('Días del mes', { exact: true })).toHaveCount(0);
  await page
    .locator('.habit-detail-calendar')
    .getByRole('button', { name: 'Mes anterior', exact: true })
    .click();
  await expect(metric.locator('strong')).toHaveText('2 / 3');
});

test('R10: consistency follows the theme accent instead of the habit color', async ({ page }) => {
  const fixture = await habitsDesignFixture(page, 3);
  for (const habit of fixture.habits) Object.assign(habit, { color: '#e03131' });
  await page.goto('/habits');
  const section = page.locator('.habit-constancy');
  const cell = section.locator('[data-date="2026-10-28"]');
  await expect(cell).toHaveAttribute('data-level', '4');
  const fullColor = async () => cell.evaluate((element) => getComputedStyle(element).fill);
  const initial = await fullColor();
  await section.getByRole('combobox', { name: 'Hábito', exact: true }).selectOption('habit-0');
  expect(await fullColor()).toBe(initial);
  for (const accent of ['violet', 'teal']) {
    const previous = await fullColor();
    await page.evaluate(
      (value) => document.documentElement.setAttribute('data-accent', value),
      accent,
    );
    await expect.poll(fullColor).not.toBe(previous);
    expect(await cell.getAttribute('fill')).toContain('var(--accent)');
    const legend = section.locator('.stats-heatmap-legend span').last();
    expect(await legend.getAttribute('style')).toContain('var(--accent)');
  }
  await page.getByRole('link', { name: 'Beber agua · Ver detalle', exact: true }).click();
  const detailCell = page.locator('.habit-constancy [data-date="2026-10-28"]');
  await expect(detailCell).toHaveAttribute('fill', /var\(--accent\)/);
});
