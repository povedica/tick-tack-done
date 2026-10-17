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
  if (event.request.method !== 'POST') {
    return;
  }
  const url = new URL(event.request.url);
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
