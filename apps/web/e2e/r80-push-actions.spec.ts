import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';
test('TTD-AUD-102: registered service worker handles push and completion with a simulated OS notification surface', async ({
  page,
  context,
}, info) => {
  test.skip(
    info.project.name !== 'desktop-light',
    'Service worker handler verified once in Chromium',
  );
  test.skip(process.env.R80_PREVIEW !== '1', 'Requires production service worker preview');
  await context.grantPermissions(['notifications']);
  await r80Fixture(page);
  let sent: unknown;
  await context.route('**/reminders/11111111-1111-4111-8111-111111111111/action', (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ json: { applied: true, url: '/today?task=task' } });
  });
  await page.goto('/today');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const shown = await worker.evaluate(async () => {
    let shown: { data?: unknown; actions?: { action: string }[] } | undefined;
    self.registration.showNotification = (_title, options) => {
      shown = options;
      return Promise.resolve();
    };
    const payload = {
      title: 'Synthetic reminder',
      body: 'Synthetic task only',
      data: {
        delivery_id: '11111111-1111-4111-8111-111111111111',
        token: 'abcdefghijklmnopqrstuvwx',
        url: '/today?task=task',
      },
      actions: [
        { action: 'complete', title: 'Completar' },
        { action: 'snooze', title: 'Posponer 10 min' },
        { action: 'open', title: 'Abrir' },
      ],
    };
    const pending: Promise<unknown>[] = [];
    const push = new PushEvent('push', { data: JSON.stringify(payload) });
    Object.defineProperty(push, 'waitUntil', {
      value: (promise: Promise<unknown>) => pending.push(promise),
    });
    self.dispatchEvent(push);
    await Promise.all(pending);
    if (!shown) throw new Error('Production push handler did not call showNotification');
    const click = new Event('notificationclick');
    Object.defineProperties(click, {
      action: { value: 'complete' },
      notification: {
        value: {
          data: shown.data,
          close: () => {
            /* Simulated OS dismissal. */
          },
        },
      },
      waitUntil: { value: (promise: Promise<unknown>) => pending.push(promise) },
    });
    self.dispatchEvent(click);
    await Promise.all(pending);
    return shown;
  });
  expect(shown.actions?.map((action) => action.action)).toEqual(['complete', 'snooze', 'open']);
  await expect.poll(() => sent).toEqual({ action: 'complete', token: 'abcdefghijklmnopqrstuvwx' });
});
