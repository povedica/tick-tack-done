import { type Page } from '@playwright/test';
import { r80Fixture } from './r80.fixture';
export async function wtAFixture(page: Page) {
  await r80Fixture(page, { filtering: true });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const source = (n: number, prefix: string) =>
      Array.from({ length: n }, (_, i) => ({
        id: `${prefix}-${i}`,
        name: `${prefix} ${i}`,
        color: '#2563eb',
        summary: `${prefix} ${i}`,
      }));
    const base = {
      project_id: 'Lista-0',
      parent_id: null,
      column_id: null,
      content: '',
      status: 'active',
      kind: 'task',
      priority: 'none',
      start_date: null,
      time_zone: 'Europe/Madrid',
      is_all_day: false,
      repeat_rule: null,
      tag_ids: [],
      checklist_progress: { completed: 0, total: 0 },
      completed_at: null,
      created_at: '2026-10-01T08:00:00Z',
      source: 'manual',
    };
    const tasks = [15, 30, 60].map((duration, i) => ({
      ...base,
      id: `block-${duration}`,
      title: `Bloque ${duration} minutos con un título muy largo que comprueba la elipsis sin ocultar la hora`,
      duration_minutes: duration,
      due_date: `2026-10-28T${String(10 + i * 2).padStart(2, '0')}:00:00Z`,
    }));
    tasks.push(
      ...Array.from({ length: 6 }, (_, i) => ({
        ...base,
        id: `overflow-${i}`,
        title: `Elemento del día ${i + 1} con título completo`,
        duration_minutes: 30,
        due_date: '2026-10-29T08:00:00Z',
        is_all_day: true,
      })),
    );
    let body: unknown;
    if (path === '/tasks') body = { items: tasks, next_cursor: null };
    if (path === '/projects') body = { items: source(25, 'Lista'), next_cursor: null };
    if (path === '/tags') body = { items: source(10, 'Etiqueta'), next_cursor: null };
    if (path === '/filters') body = { items: source(3, 'Filtro'), next_cursor: null };
    if (path === '/calendar/subscriptions')
      body = { items: source(2, 'Calendario'), next_cursor: null };
    if (body === undefined) return route.fallback();
    await route.fulfill({ json: body });
  });
}
