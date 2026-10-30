import { createApiClient } from '@reflexionia/sdk';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { shareTargetRedirect } from './features/capture/share-target';

interface ShareFetchEvent {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
}

interface WorkerScope {
  __WB_MANIFEST: (string | { url: string; revision?: string | null })[];
  addEventListener(type: 'fetch', listener: (event: ShareFetchEvent) => void): void;
  skipWaiting(): Promise<void>;
}

const scope = self as unknown as WorkerScope;

// Workbox replaces this exact member in the built worker. Keep the literal.
/* eslint-disable @typescript-eslint/no-unsafe-argument */
// @ts-expect-error Window has no service-worker manifest; the injection point is required.
precacheAndRoute(self.__WB_MANIFEST);
/* eslint-enable @typescript-eslint/no-unsafe-argument */
cleanupOutdatedCaches();

scope.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/s/')) {
    return;
  }
  if (event.request.method !== 'POST') {
    return;
  }
  if (url.pathname !== '/quick-add') {
    return;
  }
  event.respondWith(redirectShare(event.request, url.origin));
});

async function redirectShare(request: Request, origin: string): Promise<Response> {
  const form = await request.formData();
  const location = shareTargetRedirect(origin, {
    title: field(form, 'title'),
    text: field(form, 'text'),
    url: field(form, 'url'),
  });
  return Response.redirect(location, 303);
}

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

void scope.skipWaiting();

interface PushScope {
  registration: {
    showNotification(
      title: string,
      options: {
        body: string;
        data?: unknown;
        actions?: readonly { action: string; title: string }[];
      },
    ): Promise<void>;
  };
  clients: { openWindow(url: string): Promise<unknown> };
  addEventListener(
    type: 'push',
    listener: (event: {
      data: { json(): unknown } | null;
      waitUntil(promise: Promise<unknown>): void;
    }) => void,
  ): void;
  addEventListener(
    type: 'notificationclick',
    listener: (event: {
      action: string;
      notification: { data: unknown; close(): void };
      waitUntil(promise: Promise<unknown>): void;
    }) => void,
  ): void;
}
const notifications = self as unknown as PushScope;
notifications.addEventListener('push', (event) => {
  const payload = record(event.data?.json());
  const actions = Array.isArray(payload.actions)
    ? payload.actions.flatMap((value) => {
        const item = record(value);
        return typeof item.action === 'string' && typeof item.title === 'string'
          ? [{ action: item.action, title: item.title }]
          : [];
      })
    : [];
  event.waitUntil(
    notifications.registration.showNotification(
      typeof payload.title === 'string' ? payload.title : 'tick-tack-done',
      { body: typeof payload.body === 'string' ? payload.body : '', data: payload.data, actions },
    ),
  );
});
notifications.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = record(event.notification.data);
  const action =
    event.action === 'complete' ? 'complete' : event.action === 'snooze' ? 'snooze' : 'open';
  if (typeof data.delivery_id !== 'string' || typeof data.token !== 'string') return;
  const client = createApiClient({ baseUrl: '', credentials: 'include' });
  event.waitUntil(
    client.notificationAction(data.delivery_id, { token: data.token, action }).then((result) => {
      if (
        action === 'open' &&
        typeof result.url === 'string' &&
        result.url.startsWith('/') &&
        !result.url.startsWith('//')
      )
        return notifications.clients.openWindow(result.url);
      return undefined;
    }),
  );
});
function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
