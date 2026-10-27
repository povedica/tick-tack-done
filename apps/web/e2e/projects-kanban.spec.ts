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
      await route.fulfill({ json: { id: 'job', state } });
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
  await page.getByRole('link', { name: 'Proyectos' }).click();
  await expect(page.getByRole('heading', { name: 'Proyectos' })).toBeVisible();
  await expect(page.getByText('Ver archivados 1')).toBeVisible();
  const card = page.locator('[data-project-id="job"]');
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
