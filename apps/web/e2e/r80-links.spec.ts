import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';
test('TTD-AUD-100 links update in two seconds, validate schemes and use compact accessible chips', async ({
  page,
}, info) => {
  await r80Fixture(page, { links: true });
  let links = [
    {
      id: 'link',
      task_id: 'task',
      url: 'https://example.com/a',
      title: 'Example',
      source: 'auto',
      created_at: '2026-10-22T00:00:00Z',
      updated_at: '2026-10-22T00:00:00Z',
    },
  ];
  await page.route('**/tasks/task/links*', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      links.push({
        ...links[0]!,
        id: 'manual',
        url: body.url,
        title: body.title || 'Manual',
        source: 'manual',
      });
      return route.fulfill({ status: 201, json: links.at(-1) });
    }
    if (route.request().method() === 'DELETE') {
      links = links.filter((link) => !route.request().url().endsWith(link.id));
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: { items: links, next_cursor: null } });
  });
  if (!info.project.name.startsWith('mobile')) {
    await page.goto('/today');
    await expect(page.locator('.task-link-count').first()).toHaveText('2');
  }
  await page.goto('/today?task=task');
  const chip = page.locator('.task-link-chip').first();
  await expect(chip).toBeVisible();
  expect(
    Math.abs(
      (await chip.boundingBox())!.height - (info.project.name.startsWith('mobile') ? 32 : 24),
    ),
  ).toBeLessThanOrEqual(1);
  await expect(chip).toHaveAttribute('target', '_blank');
  links.push({ ...links[0]!, id: 'remote', url: 'https://ttd.dev/' });
  await expect(page.locator('.task-link-chip')).toHaveCount(2, { timeout: 2000 });
  await page.getByRole('button', { name: 'Añadir enlace', exact: true }).click();
  await page.getByLabel('URL', { exact: true }).fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Guardar enlace' }).click();
  await expect(page.locator('.link-error')).toBeVisible();
  await page.getByLabel('URL', { exact: true }).fill('https://example.com/manual');
  await page.getByRole('button', { name: 'Guardar enlace' }).click();
  await expect(page.locator('.task-link-chip')).toHaveCount(3);
});

test('TTD-AUD-100: unfurled titles remain literal text rather than HTML', async ({ page }) => {
  await r80Fixture(page, { links: true });
  const title = '<img src=x onerror="window.unfurlExecuted=true">';
  await page.route('**/tasks/task/links', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'safe-text',
            task_id: 'task',
            url: 'https://example.test/',
            title,
            source: 'manual',
            created_at: '2026-10-22T10:00:00Z',
            updated_at: '2026-10-22T10:00:00Z',
          },
        ],
        next_cursor: null,
      },
    }),
  );
  await page.goto('/today?task=task');
  const label = page.locator('.task-links .asset-name');
  await expect(label).toHaveText(title);
  await expect(label.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => Object.hasOwn(window, 'unfurlExecuted'))).toBe(false);
});
