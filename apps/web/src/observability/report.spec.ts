// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => {
  const capture = vi.fn((_error: unknown, _source: string) => '0123456789abcdef0123456789abcdef');
  return { capture, createReporter: vi.fn(() => ({ capture })) };
});
vi.mock('./sentry-client', () => ({ createReporter: client.createReporter }));

async function load() {
  vi.resetModules();
  return import('./report');
}

beforeEach(() => {
  client.createReporter.mockClear();
  client.capture.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('error reporting shim (#209)', () => {
  it('CA-09: without VITE_SENTRY_DSN nothing loads and nothing is sent', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    const { installErrorReporting, reportError, reporterConfig } = await load();
    expect(reporterConfig()).toBeNull();
    await expect(reportError(new Error('boom'), 'react')).resolves.toBeNull();
    const add = vi.spyOn(window, 'addEventListener');
    installErrorReporting();
    expect(add).not.toHaveBeenCalled();
    expect(client.createReporter).not.toHaveBeenCalled();
  });

  it('CA-10: the same error object is reported once', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://webkey@o0.ingest.de.sentry.io/2');
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'staging');
    const { reportError, reporterConfig } = await load();
    expect(reporterConfig()?.environment).toBe('staging');
    expect(reporterConfig()?.release).toMatch(/^ttd-web@/);
    const error = new Error('boom');
    await expect(reportError(error, 'react')).resolves.toBe('0123456789abcdef0123456789abcdef');
    await expect(reportError(error, 'window')).resolves.toBeNull();
    expect(client.capture).toHaveBeenCalledTimes(1);
  });

  it('API rejections, aborts, network failures and offline stay local', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://webkey@o0.ingest.de.sentry.io/2');
    const { reportError } = await load();
    const { ApiError } = await import('@reflexionia/sdk');
    await reportError(new ApiError(500, 'internal', 'boom'), 'action');
    await reportError(new ApiError(409, 'conflict', 'boom'), 'action');
    await reportError(new TypeError('Failed to fetch'), 'action');
    await reportError(new DOMException('aborted', 'AbortError'), 'action');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await reportError(new Error('offline bug'), 'action');
    expect(client.createReporter).not.toHaveBeenCalled();
  });

  it('?sentry-smoke sends one tagged event in staging only', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://webkey@o0.ingest.de.sentry.io/2');
    window.history.replaceState(null, '', '/today?sentry-smoke');
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'production');
    (await load()).installErrorReporting()();
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'staging');
    (await load()).installErrorReporting()();
    await vi.waitFor(() => {
      expect(client.capture).toHaveBeenCalledTimes(1);
    });
    expect(client.capture).toHaveBeenCalledWith(expect.any(Error), 'smoke');
    window.history.replaceState(null, '', '/');
  });

  it('uncaught window errors are reported; resource errors without an Error are not', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://webkey@o0.ingest.de.sentry.io/2');
    const { installErrorReporting } = await load();
    const uninstall = installErrorReporting();
    window.dispatchEvent(new ErrorEvent('error', { message: 'img failed' }));
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('handler bug') }));
    await vi.waitFor(() => {
      expect(client.capture).toHaveBeenCalledTimes(1);
    });
    expect(client.capture).toHaveBeenCalledWith(expect.any(Error), 'window');
    uninstall();
  });

  it('deploy_sha is the deployment SHA, the same tag the API sends', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://webkey@o0.ingest.de.sentry.io/2');
    (globalThis as { __DEPLOY_SHA__?: string }).__DEPLOY_SHA__ = '0123456789abcdef0123456789abcdef';
    const { reporterConfig } = await load();
    expect(reporterConfig()?.deploySha).toBe('0123456');
    delete (globalThis as { __DEPLOY_SHA__?: string }).__DEPLOY_SHA__;
  });
});
