import { expect, test, type Page } from '@playwright/test';

test.use({ locale: 'es-ES' });

const liveSession = {
  id: 'session',
  type: 'focus',
  planned_minutes: 25,
  started_at: new Date(Date.now() - 5_000).toISOString(),
  ended_at: null,
  paused_at: null,
  paused_seconds: 0,
  remaining_seconds: 1_495,
  task_id: null,
};

async function installApi(page: Page, active: () => Record<string, unknown> | null) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path.includes('/events/stream')) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    let body: unknown = { items: [], next_cursor: null };
    if (path === '/me' || path === '/auth/session') {
      body = {
        id: 'user',
        email: 'test@example.test',
        display_name: 'Test',
        csrf_token: 'test',
        time_zone: 'Europe/Madrid',
        locale: 'es',
        features: {},
      };
    } else if (path === '/focus/sessions') {
      const session = active();
      body = { items: session ? [session] : [], next_cursor: null };
    }
    await route.fulfill({ status: 200, json: body });
  });
}

function focusRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/focus/')) urls.push(request.url());
  });
  return urls;
}

test('CA-R5-1: sin foco, una sola petición a /focus en 60 s', async ({ page }) => {
  test.setTimeout(90_000);
  await installApi(page, () => null);
  const urls = focusRequests(page);
  await page.goto('/today');
  await page.waitForTimeout(60_000);
  expect(urls).toHaveLength(1);
  expect(urls[0]).toContain('/focus/sessions?status=active');
});

test('CA-R5-2: con foco visible, como mucho 3 peticiones en 60 s y el reloj avanza', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await installApi(page, () => liveSession);
  const urls = focusRequests(page);
  await page.goto('/today');
  const rail = page.getByRole('link', { name: /Foco en curso \d{2}:\d{2}/ });
  await expect(rail).toBeVisible();
  const first = await rail.getAttribute('aria-label');
  await page.waitForTimeout(1_500);
  expect(await rail.getAttribute('aria-label')).not.toBe(first);
  await page.waitForTimeout(60_000);
  expect(urls.length).toBeLessThanOrEqual(3);
  expect(urls.every((url) => url.includes('/focus/sessions?status=active'))).toBe(true);
});

test('CA-R5-3: empezar un foco muestra el contador en el título y en el raíl', async ({ page }) => {
  test.setTimeout(30_000);
  let session: Record<string, unknown> | null = null;
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    if (path.includes('/events/stream')) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    let body: unknown = { items: [], next_cursor: null };
    let status = 200;
    if (path === '/me' || path === '/auth/session') {
      body = {
        id: 'user',
        email: 'test@example.test',
        display_name: 'Test',
        csrf_token: 'test',
        time_zone: 'Europe/Madrid',
        locale: 'es',
        features: {},
      };
    } else if (path === '/focus/sessions' && route.request().method() === 'POST') {
      const input = route.request().postDataJSON() as { planned_minutes?: number };
      session = {
        ...liveSession,
        planned_minutes: input.planned_minutes ?? 25,
        started_at: new Date().toISOString(),
        remaining_seconds: (input.planned_minutes ?? 25) * 60,
      };
      body = session;
      status = 201;
    } else if (path === '/focus/sessions') {
      body = { items: session ? [session] : [], next_cursor: null };
    } else if (path === '/focus/settings') {
      body = { pomodoroMinutes: 25, pomodoro_minutes: 25 };
    } else if (path === '/focus/stats') {
      body = { today_pomodoros: 0, today_focus_seconds: 0 };
    }
    await route.fulfill({ status, json: body });
  });
  await page.goto('/focus');
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  await expect(page).toHaveTitle(/\d{2}:\d{2}/, { timeout: 1_000 });
  await expect(page.getByRole('link', { name: /Foco en curso \d{2}:\d{2}/ })).toBeVisible();
  expect(page.url()).toContain('/focus');
});

test('CA-R5-6: con la pestaña oculta no hay peticiones a /focus', async ({ page }) => {
  test.setTimeout(90_000);
  await installApi(page, () => liveSession);
  const urls = focusRequests(page);
  await page.goto('/today');
  await expect(page.getByRole('link', { name: /Foco en curso \d{2}:\d{2}/ })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const seen = urls.length;
  await page.waitForTimeout(60_000);
  expect(urls.length).toBe(seen);
});
