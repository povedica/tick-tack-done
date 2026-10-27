import { expect, test } from '@playwright/test';
import { wtFFixture } from './wt-f.fixture';

test('Production build bootstraps session CSRF for planning and location writes', async ({
  page,
  context,
}) => {
  await wtFFixture(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 40.4, longitude: -3.7 });
  const seen: string[] = [];
  for (const path of ['/api/v1/planning/sessions', '/api/v1/me/location']) {
    await page.route(`**${path}`, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      const headers = route.request().headers();
      expect(headers['x-csrf-token']).toBe('test');
      expect(headers['x-dev-user-email']).toBeUndefined();
      seen.push(path);
      if (path.endsWith('/location')) await route.fulfill({ json: {} });
      else await route.fallback();
    });
  }
  await page.goto('/plan/day');
  await expect(page.locator('#plan-task-title')).toBeVisible();
  await expect.poll(() => seen.includes('/api/v1/planning/sessions')).toBe(true);
  await expect.poll(() => seen.includes('/api/v1/me/location')).toBe(true);
});
