import * as Sentry from '@sentry/nestjs';
import type { ErrorEvent, EventHint, Integration } from '@sentry/core';
import { fingerprintOf, scrubEvent } from './scrub-event.js';
import { sentrySettings, type SentrySettings } from './settings.js';
import { EventThrottle, throttleLimits } from './throttle.js';

export interface SentryInitOptions {
  /** Tests pass a fake transport: nothing leaves the process. */
  readonly transport?: NonNullable<Sentry.NodeOptions['transport']>;
  /**
   * Process handlers (uncaught exception, strict unhandled rejection). Tests that run
   * inside Vitest turn them off; the child-process test keeps them on.
   */
  readonly processHandlers?: boolean;
}

const SUMMARY = 'throttleSummary';
const SUMMARY_EVERY_MS = 10 * 60_000;

let settings: SentrySettings | null = null;
let throttle: EventThrottle | null = null;
let summaryTimer: ReturnType<typeof setInterval> | null = null;

export function sentryActive(): boolean {
  return settings !== null;
}

export function activeSentrySettings(): SentrySettings | null {
  return settings;
}

/**
 * Errors only. No tracing, profiling, replay, logs or metrics. Without
 * SENTRY_ENABLED=true and a DSN nothing is initialized and nothing is sent.
 */
export function initSentry(
  env: Readonly<Record<string, string | undefined>>,
  options: SentryInitOptions = {},
): boolean {
  const resolved = sentrySettings(env);
  if (resolved === null) {
    return false;
  }
  const limiter = new EventThrottle(throttleLimits(resolved.environment));
  // No dedupeIntegration: it drops every repeat of the same error, which hides frequency.
  // The core already skips an error object that was captured once.
  const integrations: Integration[] = [Sentry.linkedErrorsIntegration()];
  if (options.processHandlers !== false) {
    integrations.push(
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration({ mode: 'strict' }),
    );
  }
  Sentry.init({
    dsn: resolved.dsn,
    environment: resolved.environment,
    release: resolved.release,
    // v11 has no sendDefaultPii: every collector is turned off here, field by field.
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
    // tracesSampleRate stays undefined: any number, even 0, turns span creation on.
    profileSessionSampleRate: 0,
    enableOpenTelemetrySetup: false,
    enableRuntimeChannelInjection: false,
    includeLocalVariables: false,
    defaultIntegrations: false,
    integrations,
    maxBreadcrumbs: 0,
    sendClientReports: false,
    attachStacktrace: false,
    shutdownTimeout: 2_000,
    initialScope: { tags: { deploy_sha: resolved.deploySha } },
    beforeSend: (event: ErrorEvent, hint: EventHint) => {
      const clean = scrubEvent(event, hint);
      // The «suprimidos N» summary is an event too: it spends the same hourly and daily caps.
      const key = isSummary(hint) ? SUMMARY : fingerprintOf(clean);
      return limiter.admit(key) ? clean : null;
    },
    beforeBreadcrumb: () => null,
    ...(options.transport === undefined ? {} : { transport: options.transport }),
  });
  settings = resolved;
  throttle = limiter;
  startSummaries();
  return true;
}

/** Sends one «suprimidos N» message for whatever the throttle dropped since the last one. */
export function flushThrottleSummary(): void {
  const count = throttle?.takeSuppressed() ?? 0;
  if (count === 0 || !sentryActive()) {
    return;
  }
  Sentry.captureEvent(
    { message: `Sentry: suprimidos ${String(count)} eventos por el throttling`, level: 'warning' },
    { data: { [SUMMARY]: true } },
  );
}

export async function closeSentry(): Promise<void> {
  if (summaryTimer !== null) {
    clearInterval(summaryTimer);
    summaryTimer = null;
  }
  flushThrottleSummary();
  if (sentryActive()) {
    await Sentry.close(2_000);
  }
  settings = null;
  throttle = null;
}

function startSummaries(): void {
  if (summaryTimer !== null) {
    clearInterval(summaryTimer);
  }
  summaryTimer = setInterval(flushThrottleSummary, SUMMARY_EVERY_MS);
  summaryTimer.unref();
}

function isSummary(hint: EventHint): boolean {
  const data: unknown = hint.data;
  return typeof data === 'object' && data !== null && SUMMARY in data;
}
