import { ApiError } from '@reflexionia/sdk';
import type { Reporter, ReporterConfig } from './sentry-client';

export type ErrorSource = 'react' | 'action' | 'window' | 'smoke';

const NETWORK = /^(Failed to fetch|Load failed)$|NetworkError|network connection was lost/;

let loading: Promise<Reporter | null> | null = null;
const reported = new WeakSet();

/** Empty DSN: Sentry is never downloaded and nothing is sent (CA-09). */
export function reporterConfig(): ReporterConfig | null {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim() ?? '';
  if (dsn.length === 0) return null;
  const commit = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'unknown';
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
  const sha = /^[a-f0-9]{7,40}$/i.test(commit) ? commit.slice(0, 7) : 'unknown';
  const environment = import.meta.env.VITE_SENTRY_ENVIRONMENT?.trim() ?? '';
  return {
    dsn,
    environment: environment.length > 0 ? environment : 'development',
    release: `ttd-web@${version}+${sha}`,
    deploySha: sha,
  };
}

/**
 * Reports an unexpected client failure once and resolves to its event id. API rejections are
 * already reported by the API; offline and aborted requests are not bugs (CA-10, CA-13).
 */
export function reportError(error: unknown, source: ErrorSource): Promise<string | null> {
  const config = reporterConfig();
  if (config === null || !worthReporting(error)) return Promise.resolve(null);
  if (typeof error === 'object' && error !== null) {
    if (reported.has(error)) return Promise.resolve(null);
    reported.add(error);
  }
  loading ??= import('./sentry-client').then(
    (module) => module.createReporter(config),
    () => {
      loading = null;
      return null;
    },
  );
  return loading.then((reporter) => reporter?.capture(error, source) ?? null).catch(() => null);
}

/** Uncaught errors outside React. Rejections already go through installActionErrorFallback. */
export function installErrorReporting(): () => void {
  const config = reporterConfig();
  if (config === null) return () => undefined;
  // Staging smoke: open any page with ?sentry-smoke to send one tagged test event.
  if (
    config.environment === 'staging' &&
    new URLSearchParams(location.search).has('sentry-smoke')
  ) {
    reportError(new Error('Sentry smoke (staging web)'), 'smoke').catch(() => null);
  }
  const onError = (event: ErrorEvent): void => {
    if (event.error instanceof Error) {
      reportError(event.error, 'window').catch(() => null);
    }
  };
  window.addEventListener('error', onError);
  return () => {
    window.removeEventListener('error', onError);
  };
}

function worthReporting(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  if (error instanceof ApiError) return false;
  if (typeof error !== 'object' || error === null) return true;
  // DOMException is not an Error subclass everywhere.
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === 'AbortError') return false;
  return !(name === 'TypeError' && typeof message === 'string' && NETWORK.test(message));
}
