import { test, expect, type Page } from '@playwright/test';
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
    if (path === '/calendar/events')
      body = {
        external: Array.from({ length: 3 }, (_, i) => ({
          id: `external-${i}`,
          title: `Evento externo ${i + 1} completo`,
          subscription_id: 'Calendario-0',
          calendar_id: 'Calendario-0',
          provider: 'ical',
          time_zone: 'Europe/Madrid',
          description: null,
          location: null,
          color: '#0f766e',
          is_all_day: false,
          starts_at: '2026-10-27T08:00:00Z',
          ends_at: '2026-10-27T09:00:00Z',
        })),
        tasks: [],
      };
    if (
      path === '/calendar/events' &&
      typeof body === 'object' &&
      body !== null &&
      'external' in body &&
      Array.isArray(body.external)
    )
      body.external.push({
        id: 'multi-day',
        title: 'Evento externo de varios días',
        subscription_id: 'Calendario-0',
        calendar_id: 'Calendario-0',
        provider: 'ical',
        time_zone: 'UTC',
        description: null,
        location: null,
        color: '#0f766e',
        is_all_day: true,
        starts_at: '2026-10-30T00:00:00Z',
        ends_at: '2026-11-02T00:00:00Z',
      });
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

export function contrastRatio(first: string, second: string): number {
  const light = (value: string) => {
    const channels = (value.match(/[\d.]+/g) ?? []).slice(0, 3).map((n) => {
      const c = Number(n) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
  };
  const a = light(first),
    b = light(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test.afterEach(async ({ page }, info) => {
  if (process.env.WT_A_PHASE === 'antes' || info.status === 'skipped') return;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );
});
