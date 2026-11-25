import {
  breadcrumbsIntegration,
  captureException,
  eventFiltersIntegration,
  init,
  linkedErrorsIntegration,
  withScope,
  type BrowserOptions,
} from '@sentry/react';
import type { ErrorSource } from './report';
import { fingerprintOf, safePath, scrubBreadcrumb, scrubEvent, TUNNEL_PATH } from './scrub';
import { WebThrottle, webThrottleLimits } from './throttle';

export interface ReporterConfig {
  readonly dsn: string;
  readonly environment: string;
  readonly release: string;
  readonly deploySha: string;
  readonly transport?: BrowserOptions['transport'];
}

export interface Reporter {
  capture(error: unknown, source: ErrorSource): string;
}

/** Noise the user cannot act on: offline fetches, aborted requests, browser quirks. */
export const IGNORE_ERRORS: (string | RegExp)[] = [
  /^Failed to fetch$/,
  /NetworkError when attempting to fetch resource/,
  /^Load failed$/,
  /The network connection was lost/,
  /The operation was aborted/,
  /AbortError/,
  /ResizeObserver loop/,
  /^Script error\.?$/,
  /Non-Error promise rejection captured/,
];

/** Loaded on the first error only. Free plan: errors only, no replay, tracing, logs or feedback. */
export function createReporter(config: ReporterConfig): Reporter {
  const throttle = new WebThrottle(webThrottleLimits(config.environment));
  init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tunnel: TUNNEL_PATH,
    ...(config.transport === undefined ? {} : { transport: config.transport }),
    defaultIntegrations: false,
    integrations: [
      eventFiltersIntegration(),
      linkedErrorsIntegration(),
      breadcrumbsIntegration({ dom: false, fetch: true, history: true, sentry: false, xhr: true }),
    ],
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
    },
    ignoreErrors: IGNORE_ERRORS,
    maxBreadcrumbs: 20,
    sendClientReports: false,
    attachStacktrace: false,
    initialScope: { tags: { component: 'web', deploy_sha: config.deploySha } },
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend(event) {
      // CA-13: no network, no event. Nothing is queued for later.
      if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
      const clean = scrubEvent(event);
      return throttle.admit(fingerprintOf(clean)) ? clean : null;
    },
  });
  return {
    capture(error, source) {
      return withScope((scope) => {
        scope.setTag('source', source);
        if (source === 'smoke') scope.setTag('smoke', 'true');
        scope.setTag('route', safePath(location.pathname));
        return captureException(error);
      });
    },
  };
}
