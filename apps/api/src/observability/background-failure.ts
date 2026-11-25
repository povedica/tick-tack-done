import { Logger } from '@nestjs/common';
import { describeError, safeStack } from './redact.js';
import { reportBackgroundError } from './sentry/report.js';

export interface BackgroundJob {
  /** Queue name, phase group or loop: `domain-events`, `calendar-local-days`, `scheduler`, `outbox`. */
  readonly queue: string;
  /** Job name or scheduler phase. Never a payload field. */
  readonly job: string;
  readonly jobId?: string | undefined;
  readonly attempts?: number | undefined;
  /** Stable throttle key. Repeating calendar polls use `calendar-sync|…`. */
  readonly fingerprint?: string | undefined;
}

const logger = new Logger('BackgroundFailure');

/**
 * Logs a failed job or phase with a scrubbed stack and, unless `report` is false, sends it.
 * An intermediate BullMQ attempt is logged and not reported. Never rethrows.
 */
export function reportBackgroundFailure(job: BackgroundJob, error: unknown, report = true): void {
  if (report) {
    reportBackgroundError(error, {
      queue: job.queue,
      job: job.job,
      fingerprint: job.fingerprint,
    });
  }
  try {
    logger.error(
      JSON.stringify({
        event: 'background_failure',
        component: 'worker',
        queue: job.queue,
        job: job.job,
        job_id: job.jobId ?? null,
        attempts: job.attempts ?? null,
        error: describeError(error),
      }),
      safeStack(error),
    );
  } catch {
    // Logging must not turn a handled failure into an unhandled one.
  }
}

/**
 * A Google or iCal poll that keeps failing. Level stays error. The fingerprint is
 * one event per throttle window, not one event per tick. The message is only the code.
 */
export function reportCalendarSyncFailure(provider: 'google' | 'ical', code: string): void {
  reportBackgroundFailure(
    {
      queue: 'scheduler',
      job: provider === 'google' ? 'google-sync' : 'ical-sync',
      fingerprint: `calendar-sync|${provider}|${code}`,
    },
    new Error(`calendar sync failed ${code}`),
  );
}

/** Runs one isolated phase: a failure is reported and the fallback is returned. */
export async function isolated<T>(
  job: BackgroundJob,
  fallback: T,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    reportBackgroundFailure(job, error);
    return fallback;
  }
}
