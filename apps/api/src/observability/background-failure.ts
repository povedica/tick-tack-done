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
}

const logger = new Logger('BackgroundFailure');

/** Logs a failed job or phase with a scrubbed stack and reports it once. Never rethrows. */
export function reportBackgroundFailure(job: BackgroundJob, error: unknown): void {
  reportBackgroundError(error, { queue: job.queue, job: job.job });
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
