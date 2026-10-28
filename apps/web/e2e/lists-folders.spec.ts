import { expect, test, type Page } from '@playwright/test';

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 375, height: 667 },
] as const) {
  test.describe(`${String(viewport.width)} light`, () => {
    test.use({ viewport, colorScheme: 'light' });
    test('creates a folder and a list, moves it, then undoes deleting the folder', async ({
      page,
    }) => {
      const state = await boot(page);
      if (viewport.width < 1024) {
        await page
          .locator('.bottom-bar')
          .getByRole('button', { name: 'Listas', exact: true })
          .click();
      }
      const sidebar = page.locator('.sidebar');
      await sidebar.getByRole('button', { name: 'Añadir', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Nueva carpeta', exact: true }).click();
      await sidebar.getByRole('textbox', { name: 'Nueva carpeta' }).fill('Personal');
      await sidebar.getByRole('textbox', { name: 'Nueva carpeta' }).press('Enter');
      const personal = sidebar.locator('[data-folder-id="personal"]');
      await expect(personal.getByRole('button', { name: 'Personal', exact: true })).toBeVisible();

      await personal.locator('.nav-more-btn').click({ force: true });
      await page.getByRole('menuitem', { name: 'Nueva lista aquí', exact: true }).click();
      await page.getByRole('dialog', { name: 'Nueva lista' }).getByLabel('Nombre').fill('Casa');
      await page.getByRole('button', { name: 'Crear lista', exact: true }).click();
      await expect(personal.getByRole('link', { name: 'Casa', exact: true })).toBeVisible();

      if (viewport.width >= 1024) {
        await page.evaluate(() => {
          const source = document.querySelector('[data-list-id="casa"]');
          const target = document.querySelector('[data-folder-id="work"] .nav-folder-main');
          if (source === null || target === null) {
            throw new Error('drag nodes missing');
          }
          const data = new DataTransfer();
          source.dispatchEvent(
            new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data }),
          );
          target.dispatchEvent(
            new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }),
          );
          target.dispatchEvent(
            new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }),
          );
        });
      } else {
        const casa = personal.getByRole('link', { name: 'Casa', exact: true });
        const box = await casa.boundingBox();
        if (box === null) {
          throw new Error('list row missing');
        }
        await casa.dispatchEvent('pointerdown', {
          pointerType: 'touch',
          clientX: box.x + 12,
          clientY: box.y + 12,
        });
        await page.waitForTimeout(600);
        await page.getByRole('menuitem', { name: /Mover a carpeta/ }).click();
        await page.getByRole('menuitem', { name: 'Trabajo', exact: true }).click();
      }

      const workFolder = sidebar.locator('[data-folder-id="work"]');
      await expect(workFolder.getByRole('link', { name: 'Casa', exact: true })).toBeVisible();
      await workFolder.locator('.nav-more-btn').click({ force: true });
      await page.getByRole('menuitem', { name: 'Renombrar', exact: true }).click();
      const rename = workFolder.getByRole('textbox', { name: 'Renombrar' });
      await rename.fill('Equipo');
      await rename.press('Enter');
      await expect(sidebar.getByRole('button', { name: 'Equipo', exact: true })).toBeVisible();
      await sidebar.locator('[data-folder-id="work"] .nav-more-btn').click({ force: true });
      await page.getByRole('menuitem', { name: 'Eliminar carpeta', exact: true }).click();
      await expect(sidebar.getByRole('link', { name: 'Casa', exact: true })).toBeVisible();
      await expect(sidebar.locator('[data-folder-id="work"]')).toHaveCount(0);
      await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
      await expect(sidebar.getByRole('button', { name: 'Equipo', exact: true })).toBeVisible();
      await expect(
        sidebar.locator('[data-folder-id="equipo"]').getByRole('link', { name: 'Casa' }),
      ).toBeVisible();
      expect(state.folders.some((folder) => folder.name === 'Equipo')).toBe(true);
    });
  });
}

async function boot(page: Page) {
  const folders = [folder('work', 'Trabajo', 0)];
  const projects = [project('inbox', 'Bandeja', { is_inbox: true })];
  await page.addInitScript(() => {
    localStorage.setItem('tick-tack-done.locale', 'es');
    localStorage.setItem('tick-tack-done.account-prefs', '1');
  });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    const method = route.request().method();
    let body: unknown = { items: [], next_cursor: null };
    if (path === '/auth/session' || path === '/me') {
      body = {
        id: 'user',
        display_name: 'Prueba',
        email: 'test@example.test',
        csrf_token: 'test',
        locale: 'es',
        time_zone: 'Europe/Madrid',
        features: {},
      };
    }
    if (path === '/smart-lists') {
      body = {
        items: [
          {
            id: 'today',
            key: 'today',
            name: 'Hoy',
            enabled: true,
            task_count: 0,
            sort_order: '1',
          },
        ],
        next_cursor: null,
      };
    }
    if (path === '/folders' && method === 'GET') body = { items: folders, next_cursor: null };
    if (path === '/folders' && method === 'POST') {
      const data = route.request().postDataJSON() as { name: string };
      const created = folder(slug(data.name), data.name, 0);
      folders.push(created);
      body = created;
    }
    if (path.startsWith('/folders/') && method === 'PATCH') {
      const id = path.split('/')[2] ?? '';
      const data = route.request().postDataJSON() as { name: string };
      const current = folders.find((item) => item.id === id);
      if (current !== undefined) current.name = data.name;
      body = current;
    }
    if (path.startsWith('/folders/') && method === 'DELETE') {
      const id = path.split('/')[2] ?? '';
      const index = folders.findIndex((item) => item.id === id);
      if (index >= 0) folders.splice(index, 1);
      for (const item of projects) {
        if (item.folder_id === id) item.folder_id = null;
      }
      await route.fulfill({ status: 204 });
      return;
    }
    if (path === '/projects' && method === 'GET') {
      const archived = url.searchParams.get('state') === 'archived';
      body = {
        items: projects.filter((item) => item.closed === archived),
        next_cursor: null,
      };
    }
    if (path === '/projects' && method === 'POST') {
      const data = route.request().postDataJSON() as { name: string; folder_id?: string | null };
      const created = project('casa', data.name, { folder_id: data.folder_id ?? null });
      projects.push(created);
      const home = folders.find((item) => item.id === created.folder_id);
      if (home !== undefined) home.project_count += 1;
      body = created;
    }
    if (path.startsWith('/projects/') && method === 'PATCH') {
      const id = path.split('/')[2] ?? '';
      const data = route.request().postDataJSON() as { folder_id?: string | null };
      const current = projects.find((item) => item.id === id);
      if (current !== undefined && data.folder_id !== undefined) current.folder_id = data.folder_id;
      body = current;
    }
    if (path === '/projects/casa/deletion-impact') {
      body = {
        project_id: 'casa',
        name: 'Casa',
        is_project: false,
        closed: false,
        task_count: 0,
        completed_count: 0,
        open_count: 0,
        subtask_count: 0,
      };
    }
    await route.fulfill({ json: body });
  });
  await page.goto('/today');
  return { folders, projects };
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function folder(id: string, name: string, count: number) {
  return {
    id,
    name,
    sort_order: '1',
    project_count: count,
    active_task_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function project(
  id: string,
  name: string,
  extra: { is_inbox?: boolean; folder_id?: string | null; closed?: boolean } = {},
) {
  return {
    id,
    name,
    color: null,
    folder_id: extra.folder_id ?? null,
    view_mode: 'list' as const,
    kind: 'TASK' as const,
    closed: extra.closed ?? false,
    closed_at: null,
    is_inbox: extra.is_inbox ?? false,
    is_project: false,
    project_status: 'active' as const,
    state: 'active' as const,
    outcome: null,
    project_status_changed_at: null,
    project_reviewed_at: null,
    default_reminder_trigger: null,
    sort_order: '1',
    active_task_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}
