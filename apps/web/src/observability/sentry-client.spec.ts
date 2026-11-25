// @vitest-environment jsdom
import {
  addBreadcrumb,
  close,
  createTransport,
  setContext,
  setExtra,
  setTag,
  setUser,
} from '@sentry/react';
import type { BrowserOptions } from '@sentry/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReporter } from './sentry-client';

const TRAP = {
  email: 'trampa.usuario@example.test',
  pat: 'rfx_pat_TRAMPA0123456789abcdef',
  oauth: 'rfx_ort_TRAMPA0123456789abcdef',
  session: '__Host-rfx_session=TRAMPAcookie0123',
  title: 'Llamar al TRAMPA médico',
  rawText: 'mañana Llamar al TRAMPA médico #salud',
};
const FORBIDDEN = ['TRAMPA', TRAP.email, 'rfx_pat_', 'rfx_ort_', '__Host-rfx_session'];

function fakeTransport(): { transport: BrowserOptions['transport']; raw: string[] } {
  const raw: string[] = [];
  const transport: BrowserOptions['transport'] = (options) =>
    createTransport(options, (request) => {
      raw.push(
        typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body),
      );
      return Promise.resolve({ statusCode: 200 });
    });
  return { transport, raw };
}

function events(raw: readonly string[]): Record<string, unknown>[] {
  return raw.flatMap((envelope) => {
    const lines = envelope.split('\n').filter((line) => line.length > 0);
    const out: Record<string, unknown>[] = [];
    for (let index = 1; index < lines.length - 1; index += 2) {
      const header = JSON.parse(lines[index] ?? '{}') as { type?: string };
      if (header.type === 'event') {
        out.push(JSON.parse(lines[index + 1] ?? '{}') as Record<string, unknown>);
      }
    }
    return out;
  });
}

function start(environment = 'production') {
  const fake = fakeTransport();
  const reporter = createReporter({
    dsn: 'https://webkey@o0.ingest.de.sentry.io/2',
    environment,
    release: 'ttd-web@0.3.0+abcdef1',
    deploySha: 'abcdef1',
    transport: fake.transport,
  });
  return { reporter, raw: fake.raw };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/lists/0d8f9a6e-1111-4111-8111-111111111111?q=TRAMPA');
});

afterEach(async () => {
  vi.restoreAllMocks();
  await close();
});

describe('web Sentry client (#209)', () => {
  it('CA-02/CA-13: the full event JSON carries no PII trap marker', async () => {
    const { reporter, raw } = start();
    setUser({ id: 'u1', email: TRAP.email });
    setTag('title', TRAP.title);
    setExtra('mutation', { title: TRAP.title, raw_text: TRAP.rawText });
    setContext('task', { title: TRAP.title });
    addBreadcrumb({ category: 'console', message: TRAP.title });
    addBreadcrumb({ category: 'ui.click', message: `button "${TRAP.title}"` });
    addBreadcrumb({
      category: 'fetch',
      type: 'http',
      data: {
        method: 'post',
        url: `/api/v1/tasks?title=${encodeURIComponent(TRAP.title)}`,
        status_code: 500,
        request_body: TRAP.rawText,
      },
    });
    addBreadcrumb({
      category: 'navigation',
      data: { from: `/public/lists/${TRAP.pat}`, to: `/search?q=${TRAP.email}` },
    });
    const error = new Error(
      `Task "${TRAP.title}" failed for ${TRAP.email} with Bearer ${TRAP.pat} ${TRAP.oauth} ${TRAP.session}`,
    );
    const id = reporter.capture(error, 'react');
    await settle();

    expect(id).toMatch(/^[0-9a-f]{32}$/);
    const serialized = raw.join('\n');
    for (const marker of FORBIDDEN) expect(serialized).not.toContain(marker);
    const [event] = events(raw);
    expect(event).toBeDefined();
    expect(event?.release).toBe('ttd-web@0.3.0+abcdef1');
    expect(event?.environment).toBe('production');
    expect(event?.user).toBeUndefined();
    expect(event?.request).toBeUndefined();
    expect(event?.extra).toBeUndefined();
    expect(event?.contexts).toBeUndefined();
    expect(event?.tags).toEqual({
      component: 'web',
      deploy_sha: 'abcdef1',
      source: 'react',
      route: '/lists/:id',
    });
    const crumbs = event?.breadcrumbs as { category: string; message: string }[];
    expect(crumbs.map((crumb) => crumb.category)).toEqual(['fetch', 'navigation']);
    expect(crumbs[0]?.message).toBe('POST /api/v1/tasks 500');
    expect(crumbs[1]?.message).toBe('/public/lists/:token -> /search');
  });

  it('masks /s/:token in the route tag and in breadcrumbs', async () => {
    window.history.replaceState(null, '', `/s/${TRAP.pat}`);
    const { reporter, raw } = start();
    addBreadcrumb({
      category: 'navigation',
      data: { from: `/s/${TRAP.pat}`, to: '/today' },
    });
    reporter.capture(new Error('public list failed'), 'react');
    await settle();
    const serialized = raw.join('\n');
    for (const marker of FORBIDDEN) expect(serialized).not.toContain(marker);
    const [event] = events(raw);
    expect(event?.tags).toMatchObject({ route: '/s/:token' });
    const crumbs = event?.breadcrumbs as { message: string }[];
    expect(crumbs.map((crumb) => crumb.message)).toContain('/s/:token -> /today');
  });

  it('throttle: 3 per fingerprint and 10 per session', async () => {
    const { reporter, raw } = start();
    for (let index = 0; index < 5; index += 1) reporter.capture(new Error('same bug'), 'action');
    await settle();
    expect(events(raw)).toHaveLength(3);
    for (let index = 0; index < 12; index += 1) {
      reporter.capture(new Error(`bug ${String(index)}`), 'action');
    }
    await settle();
    expect(events(raw)).toHaveLength(10);
  });

  it('staging: 3 per fingerprint per hour', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    const { reporter, raw } = start('staging');
    for (let index = 0; index < 4; index += 1) reporter.capture(new Error('same bug'), 'action');
    now.mockReturnValue(1_000_000 + 61 * 60 * 1000);
    reporter.capture(new Error('same bug'), 'action');
    await settle();
    expect(events(raw)).toHaveLength(4);
  });

  it('CA-13: offline drops the event instead of queueing it', async () => {
    const { reporter, raw } = start();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    reporter.capture(new Error('offline bug'), 'action');
    await settle();
    vi.restoreAllMocks();
    reporter.capture(new Error('online bug'), 'action');
    await settle();
    expect(
      events(raw).map(
        (event) => (event.exception as { values: { value: string }[] }).values[0]?.value,
      ),
    ).toEqual(['online bug']);
  });

  it('ignoreErrors drops network noise', async () => {
    const { reporter, raw } = start();
    reporter.capture(new TypeError('Failed to fetch'), 'action');
    reporter.capture(
      new Error('ResizeObserver loop completed with undelivered notifications.'),
      'window',
    );
    await settle();
    expect(events(raw)).toHaveLength(0);
  });
});
