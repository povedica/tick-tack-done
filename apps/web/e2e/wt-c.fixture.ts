import type { Page } from '@playwright/test';
import { r80Fixture } from './r80.fixture';
export type State = 'none' | 'token_saved' | 'webhook_ok' | 'linked' | 'blocked' | 'error';
export async function wtCFixture(page: Page, initial: State = 'none', pushConfigured = false) {
  await r80Fixture(page);
  let state = initial;
  const status = () => ({
    state,
    configured: state !== 'none',
    linked: state === 'linked',
    status:
      state === 'linked'
        ? 'connected'
        : state === 'blocked'
          ? 'blocked'
          : state === 'none'
            ? 'not_configured'
            : 'not_linked',
    bot_username: state === 'none' ? null : 'synthetic_bot',
    username: null,
    display_name: 'Persona sin alias',
    enabled: true,
    linked_at: state === 'linked' ? '2026-10-22T10:00:00Z' : null,
  });
  await page.route('**/api/v1/integrations/telegram**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith('/settings') && method === 'PUT') state = 'webhook_ok';
    if (path.endsWith('/settings') && method === 'DELETE') {
      state = 'none';
      await route.fulfill({ status: 204 });
      return;
    }
    if (path.endsWith('/settings/retry')) state = 'webhook_ok';
    if (path.endsWith('/telegram') && method === 'DELETE') {
      state = 'webhook_ok';
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      json: path.endsWith('/pairing')
        ? {
            code: 'synthetic-pairing-code',
            expires_at: '2026-10-22T10:10:00Z',
            bot_username: 'synthetic_bot',
            deep_link: 'https://t.me/synthetic_bot?start=synthetic-pairing-code',
          }
        : status(),
    });
  });
  await page.route('**/api/v1/me/notifications/settings', (route) =>
    route.fulfill({
      json: {
        time_zone: 'Europe/Madrid',
        preferences: [],
        quiet_hours: { start: null, end: null, days: [], allow_high: false },
        channels: {
          push: { configured: pushConfigured, public_key: '' },
          email: { address: 'synthetic@example.test', configured: true },
          telegram: status(),
        },
      },
    }),
  );
  await page.route('**/api/v1/me/notifications/test', (route) =>
    route.fulfill({ json: { sent: true } }),
  );
  return {
    setState: (next: State) => {
      state = next;
    },
  };
}
