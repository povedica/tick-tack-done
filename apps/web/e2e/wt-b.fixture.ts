import { expect, type Page } from '@playwright/test';
import { r80Fixture } from './r80.fixture';

export async function wtBFixture(
  page: Page,
  options: { wip?: boolean; locale?: 'es' | 'en' } = {},
) {
  await r80Fixture(page);
  await page.addInitScript(
    ({ locale }) => {
      localStorage.setItem('tick-tack-done.locale', locale);
    },
    { locale: options.locale ?? 'es' },
  );
  const columns = ['Pendientes', 'Hoy', 'Mañana', 'Después', 'Vacía'].map((name, index) => ({
    id: `col-${index}`,
    name,
    sort_order: String(index),
    wip_limit: index === 1 ? 1 : null,
  }));
  const tasks = Array.from({ length: 18 }, (_, index) => ({
    id: `task-${index}`,
    project_id: 'list',
    project_name: 'Lista sintética',
    parent_id: null,
    column_id: `col-${index < 15 ? 0 : index - 14}`,
    title: `Tarjeta ${index + 1}`,
    content: '',
    link_count: index === 0 ? 2 : 0,
    status: 'active',
    kind: 'task',
    priority: 'none',
    due_date: index === 0 ? '2026-10-21T00:00:00Z' : '2026-10-22T00:00:00Z',
    start_date: null,
    time_zone: 'Europe/Madrid',
    is_all_day: true,
    repeat_rule: null,
    tag_ids: [],
    tags: [],
    checklist_progress: { completed: 0, total: 0 },
    duration_minutes: null,
    completed_at: null,
    deleted_at: null,
    created_at: '2026-10-01T08:00:00Z',
    source: 'manual',
  }));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/session' || path === '/me')
      return route.fulfill({
        json: {
          id: 'user',
          display_name: 'Prueba',
          email: 'test@example.test',
          csrf_token: 'test',
          locale: options.locale ?? 'es',
          time_zone: 'Europe/Madrid',
          features: {},
        },
      });
    if (path === '/projects/list/columns')
      return route.fulfill({ json: { items: columns, next_cursor: null } });
    if (path === '/filters/preview')
      return route.fulfill({
        json: {
          groups: [{ key: 'none', label: '', tasks }],
          count: tasks.length,
          group_by: 'section',
          sort: 'manual',
          next_cursor: null,
        },
      });
    if (path === '/tasks') return route.fulfill({ json: { items: tasks, next_cursor: null } });
    if (path.startsWith('/me/view-preferences'))
      return route.fulfill({ json: { preferences: {} } });
    if (/^\/tasks\/task-\d+$/.test(path) && req.method() === 'PATCH') {
      if (options.wip)
        return route.fulfill({ status: 409, json: { code: 'wip_exceeded', message: 'WIP' } });
      const task = tasks.find((item) => `/tasks/${item.id}` === path);
      Object.assign(task ?? {}, req.postDataJSON());
      return route.fulfill({ json: task });
    }
    return route.fallback();
  });
  return { tasks, columns };
}

export async function openBoard(page: Page) {
  await page.goto('/list/list?view=kanban');
  await expect(page.locator('.kanban-col h3').first()).toContainText('Pendientes');
  await expect(page.locator('.kanban-card').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
}
