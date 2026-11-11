import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { parseFilterRules, rewriteMergedTag } from '@reflexionia/domain';
import { DomainEvent } from '../../events/domain-events.js';
import type { DomainBusEvent } from '../../events/event-bus.js';
import { EventRouter } from '../../events/event-router.js';
import { asJson } from '../../http/json.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Filters follow a tag merge without the tags module calling this one. */
@Injectable()
export class FilterTagMergeListener implements OnModuleInit {
  constructor(
    @Inject(EventRouter) private readonly router: EventRouter,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.router.subscribe((event) => this.onEvent(event));
  }

  async onEvent(event: DomainBusEvent): Promise<void> {
    if (event.type !== DomainEvent.tagMerged) {
      return;
    }
    const stored = await this.prisma.outboxEvent.findFirst({
      where: { id: event.id, ownerId: event.ownerId },
      select: { data: true },
    });
    const data = recordOf(stored?.data);
    const sourceId = textField(data, 'source_id');
    const targetId = textField(data, 'target_id');
    if (sourceId === null || targetId === null || sourceId === targetId) {
      return;
    }
    const filters = await this.prisma.filter.findMany({ where: { ownerId: event.ownerId } });
    for (const filter of filters) {
      const parsed = parseFilterRules(filter.rules, filter.mode);
      if (!parsed.ok) {
        continue;
      }
      const rewritten = rewriteMergedTag(parsed.rules, sourceId, targetId);
      if (!rewritten.changed) {
        continue;
      }
      await this.prisma.filter.update({
        where: { id: filter.id },
        data: { rules: asJson(rewritten.rules) },
      });
    }
  }
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textField(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
