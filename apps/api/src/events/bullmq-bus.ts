import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { EventBus, type DomainBusEvent } from './event-bus.js';
import { EventRouter } from './event-router.js';

const QUEUE = 'domain-events';

@Injectable()
export class BullMqEventBus extends EventBus implements OnModuleDestroy {
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(@Inject(EventRouter) private readonly router: EventRouter) {
    super();
  }

  override start(): void {
    if (this.queue !== null) {
      return;
    }
    const url = process.env.REDIS_URL;
    if (url === undefined || url.length === 0) {
      throw new Error('REDIS_URL is required to publish domain events');
    }
    const connection = new Redis(url, {
      maxRetriesPerRequest: null,
      connectTimeout: 2_000,
      retryStrategy: (times: number) =>
        process.env.NODE_ENV === 'test' && times > 2 ? null : Math.min(times * 200, 2_000),
    });
    this.queue = new Queue(QUEUE, { connection });
    this.worker = new Worker(
      QUEUE,
      (job) => {
        const data = job.data as { ownerId?: string };
        return this.router.dispatch({
          id: job.id ?? '',
          type: job.name,
          ownerId: data.ownerId ?? '',
        });
      },
      { connection, concurrency: 4 },
    );
  }

  async publish(event: DomainBusEvent): Promise<void> {
    if (this.queue === null) {
      this.start();
    }
    const queue = this.queue;
    if (queue === null) {
      throw new Error('REDIS_URL is required to publish domain events');
    }
    await queue.add(event.type, event, {
      jobId: event.id,
      removeOnComplete: 1000,
      removeOnFail: 1000,
    });
  }

  override async close(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.worker = null;
    this.queue = null;
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}

export function busAutostart(): boolean {
  if (process.env.BUS_AUTOSTART === 'false') {
    return false;
  }
  if (process.env.BUS_AUTOSTART === 'true') {
    return true;
  }
  return process.env.NODE_ENV === 'production';
}
