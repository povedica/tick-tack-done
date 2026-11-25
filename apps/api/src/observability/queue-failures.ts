import type { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { reportBackgroundFailure } from './background-failure.js';
import { scrubText } from './redact.js';

interface FailedJob {
  readonly name: string;
  readonly id?: string | undefined;
  readonly attemptsMade: number;
}

type Emitter = Pick<EventEmitter, 'on'>;

const logger = new Logger('QueueFailures');

/**
 * `failed` reports the job name, id and attempt count only: never `job.data`.
 * `error` (Redis connection, lock renewal) is logged scrubbed, not reported per job.
 */
export function watchQueue(name: string, queue: Emitter | null, worker: Emitter | null): void {
  const onError = (error: Error): void => {
    logger.error(
      JSON.stringify({
        event: 'queue_error',
        queue: name,
        error: scrubText(error.message),
      }),
    );
  };
  queue?.on('error', onError);
  worker?.on('error', onError);
  worker?.on('failed', (job: FailedJob | undefined, error: Error) => {
    reportBackgroundFailure(
      { queue: name, job: job?.name ?? 'unknown', jobId: job?.id, attempts: job?.attemptsMade },
      error,
    );
  });
}
