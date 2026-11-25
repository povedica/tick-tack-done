import { expect, test } from '@playwright/test';
import { replySession } from './mock-session';

const board = {
  items: [
    {
      id: 'job',
      name: 'busqueda-empleo',
      color: '#FFAC38',
      folder_id: null,
      outcome: 'Tener entrevistas',
      state: 'active',
      project_status_changed_at: '2026-10-20T10:00:00.000Z',
      closed_at: null,
      created_at: '2026-10-18T10:00:00.000Z',
      project_reviewed_at: null,
      done_count: 1,
      total_count: 4,
      open_count: 3,
      next_action: {
        task_id: 'next',
        title: 'Enviar CV',
        due_date: '2026-10-30T00:00:00.000Z',
        start_date: null,
        is_all_day: true,
      },
      last_activity_at: '2026-10-26T10:00:00.000Z',
      attention: null,
    },
    {
      id: 'london',
      name: 'viaje-londres',
      color: null,
      folder_id: null,
      outcome: null,
      state: 'archived',
      project_status_changed_at: '2026-10-18T10:00:00.000Z',
      closed_at: '2026-10-18T10:00:00.000Z',
      created_at: '2026-10-18T10:00:00.000Z',
      project_reviewed_at: null,
      done_count: 2,
      total_count: 2,
      open_count: 0,
      next_action: null,
      last_activity_at: null,
      attention: null,
    },
  ],
  counts: { active: 1, paused: 0, archived: 1 },
  next_cursor: null,
};

test('desktop kanban pauses with undo and archives from the folded row', async ({ page }) => {
  let state = 'active';
  await page.route('**/api/v1/**', async (route) => {
    if (await replySession(route)) return;
    const url = route.request().url();
    if (url.includes('/projects/overview')) {
      await route.fulfill({
        json: {
          ...board,
          items: board.items.map((item) => (item.id === 'job' ? { ...item, state } : item)),
          counts: {
            active: state === 'active' ? 1 : 0,
            paused: state === 'paused' ? 1 : 0,
            archived: 1,
          },
        },
      });
      return;
    }
    if (url.includes('/state') && route.request().method() === 'POST') {
      state = String(route.request().postDataJSON().state);
      await route.fulfill({ json: { ...board.items[0], id: 'job', state, is_inbox: false } });
      return;
    }
    if (url.includes('/projects') && route.request().method() === 'GET') {
      await route.fulfill({ json: { items: [], next_cursor: null } });
      return;
    }
    await route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dashboard');
  await page.locator('.garden-projects-link').click();
  await expect(page.getByRole('heading', { name: 'Proyectos' })).toBeVisible();
  await expect(page.getByText('Ver archivados 1')).toBeVisible();
  const card = page.locator('.project-board [data-project-id="job"]');
  const paused = page.locator('[data-project-column="paused"]');
  await card.dragTo(paused);
  await expect(page.getByRole('status')).toContainText('en pausa');
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await page.getByText('Ver archivados 1').click();
  await expect(page.getByText('viaje-londres')).toBeVisible();
});

test('mobile tabs open pause and move', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    if (await replySession(route)) return;
    const url = route.request().url();
    if (url.includes('/projects/overview')) {
      await route.fulfill({ json: board });
      return;
    }
    if (url.includes('/projects') && route.request().method() === 'GET') {
      await route.fulfill({ json: { items: [], next_cursor: null } });
      return;
    }
    await route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/dashboard/projects');
  await expect(page.getByRole('tab', { name: 'En marcha 1' })).toBeVisible();
  await page.getByRole('button', { name: /Acciones del proyecto/ }).click();
  await expect(page.getByRole('menuitem', { name: 'Pausar' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Mover a/ })).toBeVisible();
});

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1280, 390]) {
    test(`RF-301: opaque project menu on direct entry ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.addInitScript(
        (value) => localStorage.setItem('tick-tack-done.theme', value),
        theme,
      );
      const states: string[] = [];
      await page.route('**/api/v1/**', async (route) => {
        if (await replySession(route)) return;
        const url = route.request().url();
        if (url.includes('/projects/overview')) {
          await route.fulfill({ json: board });
        } else if (url.includes('/state') && route.request().method() === 'POST') {
          const state = String(route.request().postDataJSON().state);
          states.push(state);
          await route.fulfill({ json: { ...board.items[0], id: 'job', state, is_inbox: false } });
        } else if (url.includes('/projects') && route.request().method() === 'GET') {
          await route.fulfill({ json: { items: [], next_cursor: null } });
        } else {
          await route.fulfill({ json: {} });
        }
      });
      await page.goto('/dashboard/projects');
      await expect(page.getByRole('heading', { name: 'Proyectos' })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const trigger = page.getByRole('button', { name: /Acciones del proyecto/ });
      await trigger.click();
      const menu = page.getByRole('dialog', { name: /Acciones del proyecto:/ });
      await expect(menu).toBeVisible();
      const style = await menu.evaluate((node) => {
        const css = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return {
          background: css.backgroundColor,
          shadow: css.boxShadow,
          radius: css.borderRadius,
          hit: node.contains(
            document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
          ),
        };
      });
      expect(style.background).toBe(theme === 'dark' ? 'rgb(34, 34, 34)' : 'rgb(255, 255, 255)');
      expect(style.shadow).not.toBe('none');
      expect(style.radius).not.toBe('0px');
      expect(style.hit).toBe(true);
      await expect(page.locator('.projects-page')).toHaveCSS('background-color', style.background);
      if (width === 1280) {
        await expect(page.locator('.project-column').first()).not.toHaveCSS(
          'background-color',
          style.background,
        );
        if (theme === 'dark')
          await expect(page.locator('.project-column').first()).toHaveCSS(
            'border-top-width',
            '1px',
          );
      } else {
        await expect(menu).toHaveClass(/is-bottom-sheet/);
        const box = await menu.boundingBox();
        expect(box && Math.round(box.y + box.height)).toBe(800);
      }
      await page.screenshot({ path: `e2e/__screenshots__/projects-menu-${theme}-${width}.png` });
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await trigger.click();
      await page.mouse.click(5, 5);
      await expect(menu).toBeHidden();
      await trigger.click();
      await page.getByRole('menuitem', { name: 'Pausar', exact: true }).click();
      await expect.poll(() => states).toContain('paused');
      await trigger.click();
      await page.getByRole('menuitem', { name: 'Archivar', exact: true }).click();
      await expect.poll(() => states).toContain('archived');
    });
  }
}

test('RF-301: project actions stay visible on a touch tablet', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1024, height: 768 },
  });
  const page = await context.newPage();
  await page.route('**/api/v1/**', async (route) => {
    if (await replySession(route)) return;
    await route.fulfill({
      json: route.request().url().includes('/projects/overview')
        ? board
        : { items: [], next_cursor: null },
    });
  });
  await page.goto('/dashboard/projects');
  await expect(page.getByRole('button', { name: /Acciones del proyecto/ })).toHaveCSS(
    'opacity',
    '1',
  );
  await context.close();
});
