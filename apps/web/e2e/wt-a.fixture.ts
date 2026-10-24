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
    let body: unknown;
    if (path === '/projects') body = { items: source(25, 'Lista'), next_cursor: null };
    if (path === '/tags') body = { items: source(10, 'Etiqueta'), next_cursor: null };
    if (path === '/filters') body = { items: source(3, 'Filtro'), next_cursor: null };
    if (path === '/calendar/subscriptions')
      body = { items: source(2, 'Calendario'), next_cursor: null };
    if (body === undefined) return route.fallback();
    await route.fulfill({ json: body });
  });
}
