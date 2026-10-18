import { expect, test, type Page, type Route } from '@playwright/test';

test.use({ locale: 'es-ES' });

const LEGACY = [
  'today',
  'tomorrow',
  'next_7_days',
  'all',
  'inbox',
  'assigned_to_me',
  'completed',
  'trash',
  'no_date',
  'recently_added',
] as const;

function smartLists() {
  return {
    items: LEGACY.map((key, index) => ({
      key,
      name: key,
      enabled: true,
      task_count: key === 'completed' || key === 'trash' ? 1 : 0,
      sort_order: String((index + 1) * 65536),
    })),
  };
}

function viewTask(id: string, title: string, status: string) {
  return {
    id,
    title,
    priority: 'none',
    due_date: null,
    time_zone: 'Europe/Madrid',
    project_id: 'list-1',
    project_name: 'Trabajo',
    column_id: null,
    tags: [],
    checklist_progress: { completed: 0, total: 0 },
    kind: 'task',
    status,
    content: '',
  };
}

function viewPage(task: ReturnType<typeof viewTask>) {
  return { count: 1, groups: [{ key: 'all', name: '', tasks: [task] }] };
}

async function mockApi(page: Page, created: { body: string | null }): Promise<void> {
  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request();
    const url = request.url();
    if (request.method() === 'POST' && url.endsWith('/api/v1/tasks')) {
      created.body = request.postData();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'task-new', title: 'Informe', warnings: [] }),
      });
      return;
    }
    if (url.includes('/api/v1/smart-lists/completed/tasks')) {
      await route.fulfill({
        json: viewPage(viewTask('done-1', 'Informe cerrado', 'completed')),
      });
      return;
    }
    if (url.includes('/api/v1/smart-lists/trash/tasks')) {
      await route.fulfill({
        json: viewPage(viewTask('gone-1', 'Informe borrado', 'completed')),
      });
      return;
    }
    if (url.includes('/api/v1/smart-lists')) {
      await route.fulfill({ json: smartLists() });
      return;
    }
    if (url.includes('/api/v1/projects')) {
      await route.fulfill({
        json: {
          items: [
            {
              id: 'list-1',
              name: 'Trabajo',
              color: '#4772FA',
              is_inbox: false,
              closed: false,
              active_task_count: 0,
              sort_order: '65536',
            },
          ],
          next_cursor: null,
        },
      });
      return;
    }
    if (url.includes('/api/v1/tasks')) {
      const due = created.body?.match(/"due_date"\s*:\s*"([^"]+)"/)?.[1] ?? null;
      await route.fulfill({
        json: {
          items:
            due === null
              ? []
              : [
                  {
                    id: 'task-new',
                    title: 'Informe',
                    status: 'active',
                    kind: 'task',
                    priority: 'none',
                    due_date: due,
                    time_zone: 'Europe/Madrid',
                    project_id: 'inbox',
                    tag_ids: [],
                    content: '',
                  },
                ],
          next_cursor: null,
        },
      });
      return;
    }
    await route.fulfill({ json: { items: [] } });
  });
}

test('S1: el sidebar sigue el orden de la spec y oculta Asignadas a mí', async ({ page }) => {
  await mockApi(page, { body: null });
  await page.goto('/today');
  const sidebar = page.getByRole('complementary');
  await expect(sidebar.getByRole('link', { name: /Completadas/ })).toBeVisible();
  const labels = await sidebar.locator('nav .nav-list').first().getByRole('link').allTextContents();
  expect(labels.map((label) => label.replace(/\d+$/g, '').trim())).toEqual([
    'Hoy',
    'Mañana',
    'Próximos 7 días',
    'Todas',
    'Bandeja',
    'Sin fecha',
    'Añadidas hace poco',
    'Completadas',
  ]);
  await expect(page.getByRole('link', { name: /Asignadas a mí/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Papelera/ })).toBeVisible();
});

test('F1 y F2: quick-add en Hoy pone fecha, vacía el campo y muestra la tarea', async ({
  page,
}) => {
  const created = { body: null as string | null };
  await mockApi(page, created);
  await page.goto('/today');
  const input = page.getByLabel('Añadir tarea');
  await input.fill('Informe');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(page.getByText('Informe')).toBeVisible();
  expect(created.body).toContain('due_date');
});

test('F3 y F4: Completadas y Papelera muestran la tarea', async ({ page }) => {
  await mockApi(page, { body: null });
  await page.goto('/smart/completed');
  await expect(page.getByText('Informe cerrado')).toBeVisible();
  await page.goto('/smart/trash');
  await expect(page.getByText('Informe borrado')).toBeVisible();
});

test('F5: el menú de lista abre renombrar', async ({ page }) => {
  await mockApi(page, { body: null });
  await page.goto('/today');
  await page.getByRole('complementary').getByRole('button', { name: 'Acciones' }).click();
  await expect(page.getByLabel('Renombrar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archivar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Borrar lista' })).toBeVisible();
});
