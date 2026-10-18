import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { tombstoneCutoff } from '@reflexionia/domain';
import { PrismaService } from '../prisma/prisma.service';
import { BullMqEventBus, busAutostart } from './bullmq-bus';

const TICK_MS = 2_000;
const BATCH = 50;

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BullMqEventBus) private readonly bus: BullMqEventBus,
  ) {}

  onModuleInit(): void {
    if (!busAutostart()) {
      return;
    }
    this.bus.start();
    void this.publishPending();
    this.timer = setInterval(() => {
      void this.publishPending();
    }, TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Hands unpublished outbox rows to the bus and drops tombstones older than 90 days. */
  async publishPending(): Promise<number> {
    await this.prisma.outboxEvent.deleteMany({
      where: { type: { contains: '.deleted@' }, occurredAt: { lt: tombstoneCutoff(new Date()) } },
    });
    const rows = await this.prisma.outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      take: BATCH,
    });
    let published = 0;
    for (const row of rows) {
      try {
        await this.bus.publish({ id: row.id, type: row.type, ownerId: row.ownerId });
      } catch (error) {
        if (!isDuplicateJob(error)) {
          throw error;
        }
      }
      await this.prisma.outboxEvent.update({
        where: { id: row.id },
        data: { publishedAt: new Date() },
      });
      published += 1;
    }
    return published;
  }
}

function isDuplicateJob(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return message.includes('JobId') || message.includes('already exists');
}
