import { expect, test } from '@playwright/test';

const calendar = {
  id: 'ada@gmail.com',
  summary: 'Personal',
  primary: true,
  background_color: '#4772FA',
  access_role: 'owner',
  selected_remote: true,
  subscription: null,
};

const subscription = {
  id: '6a1b784e-6bf6-4b79-bcee-a1513f4f5f11',
  provider: 'google',
  calendar_id: 'ada@gmail.com',
  summary: 'Personal',
  color: '#4772FA',
  visible: true,
  last_synced_at: '2026-10-19T18:00:00.000Z',
  last_error: null,
  event_count: 1,
  imported: 1,
};

const external = {
  id: 'evt-1',
  title: 'Reunión de equipo',
  starts_at: new Date().toISOString(),
  ends_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  is_all_day: false,
  time_zone: 'Europe/Madrid',
  color: '#4772FA',
  provider: 'google',
  calendar_id: 'ada@gmail.com',
  summary: 'Personal',
  location: null,
  description: 'Notas',
  status: 'confirmed',
  editable: false,
};

test('RF-2540: Ajustes lista un calendario de Google y permite activarlo', async ({ page }) => {
  await mockApi(page, false);
  await page.goto('/settings/calendar');
  await expect(page.getByRole('heading', { name: 'Calendarios de Google' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Personal' }).check();
  await expect(page.getByRole('button', { name: 'Sincronizar ahora' })).toBeVisible();
});

test('RF-2541: la vista mes pinta el evento externo y el popover es de solo lectura', async ({
  page,
}) => {
  await mockApi(page, true);
  await page.goto('/calendar/month');
  await expect(page.getByRole('button', { name: /Reunión de equipo/ })).toBeVisible();
  await page.getByRole('button', { name: /Reunión de equipo/ }).click();
  await expect(page.getByText('Evento de Google Calendar · solo lectura')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quitar' })).toHaveCount(0);
});

test('RF-2542: Hoy conserva el acceso al plan sin la agenda retirada', async ({ page }) => {
  await mockApi(page, true);
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'Agenda de hoy' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Plan del día' })).toBeVisible();
});

async function mockApi(page: import('@playwright/test').Page, subscribed: boolean): Promise<void> {
  let active = subscribed;
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('/auth/session') || url.endsWith('/me')) {
      await route.fulfill({
        json: {
          id: 'user',
          email: 'test@example.test',
          display_name: 'Prueba',
          csrf_token: 'test',
          locale: 'es',
          time_zone: 'Europe/Madrid',
          features: {},
        },
      });
      return;
    }
    if (url.includes('/integrations/google') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configured: true, connected: true, account: 'ada@gmail.com' }),
      });
      return;
    }
    if (url.includes('/calendar/google/calendars')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            ...calendar,
            subscription: active
              ? { id: subscription.id, color: subscription.color, visible: true }
              : null,
          },
        ]),
      });
      return;
    }
    if (url.includes('/calendar/subscriptions') && method === 'POST') {
      active = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(subscription),
      });
      return;
    }
    if (url.includes('/calendar/subscriptions') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: active ? [subscription] : [], google_configured: true }),
      });
      return;
    }
    if (url.includes('/calendar/events')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tasks: [], external: active ? [external] : [] }),
      });
      return;
    }
    if (url.includes('/calendar/feeds')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });
}
