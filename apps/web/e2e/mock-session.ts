import type { Route } from '@playwright/test';

/** Complete session fixtures: a successful HTTP response must satisfy the SDK contract. */
export async function replySession(route: Route): Promise<boolean> {
  const path = new URL(route.request().url()).pathname;
  if (path !== '/api/v1/me' && path !== '/api/v1/auth/session') return false;
  await route.fulfill({
    status: 200,
    json: {
      id: 'fixture-user',
      email: 'fixture@example.test',
      display_name: 'Fixture',
      csrf_token: 'fixture-csrf',
      time_zone: 'Europe/Madrid',
      locale: 'es',
      features: {},
    },
  });
  return true;
}
