import { expect, test } from '@playwright/test';
import { wtBFixture } from './wt-b.fixture';
for (const locale of ['es', 'en'] as const) {
  test(`RF-1001 TTD-AUD-128: ${locale} link counts in list and kanban refresh within two seconds`, async ({
    page,
  }, info) => {
    test.skip(
      !info.project.name.startsWith('wt-b') ||
        ![390, 1280].includes(info.project.use.viewport!.width),
    );
    const state = await wtBFixture(page, { locale, secondPage: true });
    const pages: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/v1/tasks' && url.searchParams.get('project_id') === 'list')
        pages.push(url.searchParams.get('cursor') ?? 'first');
    });
    state.tasks[1]!.link_count = 1;
    await page.goto('/list/list?view=list');
    const singular = locale === 'es' ? '1 enlace' : '1 link';
    const plural = locale === 'es' ? '2 enlaces' : '2 links';
    await expect(page.locator('.task-link-count')).toHaveCount(2);
    await expect(page.getByLabel(plural, { exact: true })).toBeVisible();
    await expect(page.getByLabel(singular, { exact: true })).toBeVisible();
    await page.goto('/list/list?view=kanban');
    await expect(page.getByLabel(plural, { exact: true })).toBeVisible();
    await page.route('**/api/v1/tasks/task-0/links', async (route) => {
      state.tasks[0]!.link_count = 3;
      await route.fulfill({ status: 201, json: { id: 'new-link' } });
    });
    await page.evaluate(async () => {
      await fetch('/api/v1/tasks/task-0/links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/new' }),
      });
    });
    await expect(
      page.getByLabel(locale === 'es' ? '3 enlaces' : '3 links', { exact: true }),
    ).toBeVisible({ timeout: 2000 });
    const contrast = await page
      .locator('.task-link-count')
      .first()
      .evaluate((node) => {
        const style = getComputedStyle(node);
        const card = getComputedStyle(node.closest('.kanban-card')!);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d')!;
        const lum = (color: string) => {
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          const rgb = [...ctx.getImageData(0, 0, 1, 1).data]
            .slice(0, 3)
            .map((n) => n / 255)
            .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
          return rgb.reduce((a, n, i) => a + n * [0.2126, 0.7152, 0.0722][i]!, 0);
        };
        const a = lum(style.color),
          b = lum(card.backgroundColor);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    expect(pages.filter((cursor) => cursor === 'second').length).toBeGreaterThanOrEqual(2);
    expect(pages).not.toContain('unneeded-third');
  });
}

test('TTD-AUD-128: visible completed and cancelled rows keep their link counts', async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith('wt-b') ||
      ![390, 1280].includes(info.project.use.viewport!.width),
  );
  const state = await wtBFixture(page);
  const done = state.tasks[0];
  const cancelled = state.tasks[1];
  if (!done || !cancelled) throw new Error('Missing synthetic rows');
  done.status = 'completed';
  cancelled.status = 'cancelled';
  cancelled.link_count = 1;
  await page.addInitScript(() =>
    localStorage.setItem(
      'tick-tack-done.view-prefs.project:list',
      JSON.stringify({ hideCompleted: false }),
    ),
  );
  const statuses = new Set<string>();
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/tasks' && url.searchParams.get('project_id') === 'list')
      statuses.add(url.searchParams.get('status') ?? 'active');
  });
  await page.goto('/list/list?view=list');
  await expect(page.getByLabel('2 enlaces', { exact: true })).toBeVisible();
  await expect(page.getByLabel('1 enlace', { exact: true })).toBeVisible();
  expect([...statuses].sort()).toEqual(['active', 'cancelled', 'completed']);
  done.link_count = 3;
  await expect(page.getByLabel('3 enlaces', { exact: true })).toBeVisible({ timeout: 2000 });
});
