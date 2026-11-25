import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import * as Sentry from '@sentry/nestjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { leaks, TRAP } from './helpers/pii-trap.js';
import { fakeTransport, type CapturedEnvelopes } from './helpers/sentry-transport.js';
import { watchQueue } from '../src/observability/queue-failures.js';
import { closeSentry, initSentry } from '../src/observability/sentry/sentry.js';

const ENABLED = {
  SENTRY_ENABLED: 'true',
  SENTRY_DSN: 'https://public@o0.ingest.de.sentry.io/1',
  SENTRY_ENVIRONMENT: 'production',
  GIT_COMMIT: 'abcdef1234567890',
};

let captured: CapturedEnvelopes;

beforeEach(() => {
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  const fake = fakeTransport();
  captured = fake.captured;
  initSentry(ENABLED, { transport: fake.transport, processHandlers: false });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await closeSentry();
});

function redis(): Redis {
  const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  return new Redis(url, {
    maxRetriesPerRequest: null,
    connectTimeout: 5_000,
  });
}

describe('BullMQ last attempt', () => {
  it('reports only the last attempt of a real worker and queue', async () => {
    const name = `sentry-last-attempt-${Date.now().toString(36)}`;
    const workerRedis = redis();
    const queueRedis = redis();
    const queue = new Queue(name, { connection: queueRedis });
    const attempts: number[] = [];
    const worker = new Worker(name, () => Promise.reject(new Error('handler failed')), {
      connection: workerRedis,
      concurrency: 1,
    });
    watchQueue(name, null, worker);
    const exhausted = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`job stopped after attempts ${attempts.join(',')}`));
      }, 15_000);
      worker.on('failed', (job) => {
        if (job !== undefined) attempts.push(job.attemptsMade);
        if (attempts.length >= 3) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    try {
      await queue.waitUntilReady();
      await worker.waitUntilReady();
      await queue.add(
        'tick',
        { title: TRAP.title },
        { attempts: 3, backoff: { type: 'fixed', delay: 0 } },
      );
      await exhausted;
      await Sentry.flush(2_000);
      const events = captured.events();
      expect(attempts).toEqual([1, 2, 3]);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        tags: { component: 'worker', queue: name, job: 'tick' },
      });
      expect(leaks(captured.raw.join('\n'))).toEqual([]);
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
      workerRedis.disconnect();
      queueRedis.disconnect();
    }
  }, 20_000);
});
