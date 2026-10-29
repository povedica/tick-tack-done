import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { Queue, Worker, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service.js';
import { backfillLocalDays } from './backfill-local-days.js';
import { recalcTimedEventLocalDays } from './recalc-timed-events.js';

const QUEUE = 'calendar-local-days';
const TIMED_RECALC = 'timed-recalc';
const BACKFILL = 'backfill';
const ZONE_PASSES = 5;

export interface LocalDayJobQueue {
  add(name: string, data: { readonly ownerId: string }, opts: JobsOptions): Promise<unknown>;
}

/** One waiting job per owner. A second change while it is queued does not fail the request. */
export function timedRecalcJobOptions(ownerId: string): JobsOptions {
  return {
    jobId: `${TIMED_RECALC}:${ownerId}`,
    removeOnComplete: true,
    removeOnFail: true,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1_000 },
  };
}

export async function enqueueTimedRecalcJob(
  queue: LocalDayJobQueue,
  ownerId: string,
): Promise<void> {
  try {
    await queue.add(TIMED_RECALC, { ownerId }, timedRecalcJobOptions(ownerId));
  } catch (error) {
    if (!isAlreadyQueued(error)) {
      throw error;
    }
  }
}

/**
 * Reads the profile zone when the job runs, then again after the pass.
 * A zone change that lands while the pass is in flight is applied before the job finishes.
 */
export async function runTimedRecalc(prisma: PrismaClient, ownerId: string): Promise<void> {
  for (let pass = 0; pass < ZONE_PASSES; pass += 1) {
    const user = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { timeZone: true },
    });
    if (user === null) {
      return;
    }
    await recalcTimedEventLocalDays(prisma, ownerId, user.timeZone);
    const after = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { timeZone: true },
    });
    if (after === null || after.timeZone === user.timeZone) {
      return;
    }
  }
}

export async function runBackfill(prisma: PrismaClient, ownerId: string): Promise<void> {
  await backfillLocalDays(prisma, ownerId);
}

@Injectable()
export class LocalDayQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LocalDayQueue.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private queueRedis: Redis | null = null;
  private workerRedis: Redis | null = null;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.startWorker();
  }

  /** Puts the timed-event recalc on the queue. Does not wait for the rewrite. */
  async enqueueTimedRecalc(ownerId: string): Promise<void> {
    await enqueueTimedRecalcJob(this.ensureQueue(), ownerId);
  }

  /** Puts the task and all-day backfill on the queue. Does not wait for it. */
  async enqueueBackfill(ownerId: string): Promise<void> {
    try {
      await this.ensureQueue().add(
        BACKFILL,
        { ownerId },
        {
          jobId: `${BACKFILL}:${ownerId}`,
          removeOnComplete: true,
          removeOnFail: true,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
        },
      );
    } catch (error) {
      if (!isAlreadyQueued(error)) {
        throw error;
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.worker = null;
    this.queue = null;
    await quit(this.workerRedis);
    await quit(this.queueRedis);
    this.workerRedis = null;
    this.queueRedis = null;
  }

  private startWorker(): void {
    if (this.worker !== null || process.env.LOCAL_DAY_WORKER === 'false' || !redisUrl()) {
      return;
    }
    const redis = connectRedis();
    this.workerRedis = redis;
    this.worker = new Worker(
      QUEUE,
      async (job) => {
        const ownerId = ownerIdOf(job.data);
        if (ownerId === null) {
          return;
        }
        if (job.name === TIMED_RECALC) {
          await runTimedRecalc(this.prisma, ownerId);
          return;
        }
        if (job.name === BACKFILL) {
          await runBackfill(this.prisma, ownerId);
        }
      },
      { connection: redis, concurrency: 1 },
    );
    this.worker.on('error', (error: Error) => {
      this.logger.error(error.message);
    });
  }

  private ensureQueue(): Queue {
    if (this.queue !== null) {
      return this.queue;
    }
    const redis = connectRedis();
    this.queueRedis = redis;
    this.queue = new Queue(QUEUE, { connection: redis });
    this.queue.on('error', (error: Error) => {
      this.logger.error(error.message);
    });
    return this.queue;
  }
}

function redisUrl(): string | null {
  const url = process.env.REDIS_URL;
  if (url === undefined || url.length === 0) {
    return null;
  }
  return url;
}

function connectRedis(): Redis {
  const url = redisUrl();
  if (url === null) {
    throw new Error('REDIS_URL is required to enqueue calendar local-day jobs');
  }
  return new Redis(url, {
    maxRetriesPerRequest: null,
    connectTimeout: 2_000,
    retryStrategy: (times: number) => Math.min(times * 200, 2_000),
  });
}

function ownerIdOf(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || !('ownerId' in data)) {
    return null;
  }
  const ownerId = (data as { ownerId?: unknown }).ownerId;
  return typeof ownerId === 'string' && ownerId.length > 0 ? ownerId : null;
}

function isAlreadyQueued(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return message.includes('JobId') || message.includes('already exists');
}

async function quit(redis: Redis | null): Promise<void> {
  if (redis === null) {
    return;
  }
  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }
}
