import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { SmartList } from '@prisma/client';
import {
  isSmartListKey,
  parseTaskView,
  rebalancedSortOrders,
  SMART_LIST_KEYS,
  FIXED_SMART_LIST_KEYS,
  smartListClause,
  type FilterClock,
  type SmartListKey,
} from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { decodeCursor } from '../../http/cursor.js';
import { DomainException } from '../../http/domain.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Tx } from '../../prisma/tx.js';
import type { ViewPageJson } from '../../reading/view-page.js';
import { countViewTasks, pageViewTasks } from '../../reading/view-query.js';
import type { SmartListResponseDto, UpdateSmartListsDto } from './filters.dto.js';

const readyOwners = new Set<string>();

@Injectable()
export class SmartListsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  async list(user: AuthUser): Promise<{ items: SmartListResponseDto[] }> {
    await this.ensureOnce(user.id);
    const rows = await this.prisma.smartList.findMany({
      where: { ownerId: user.id, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    const clock = this.clock(user);
    const input = { clock, inboxProjectId: await this.inboxId(user.id), assigneeId: user.id };
    const counts = await Promise.all(
      rows.map((row) =>
        countViewTasks(this.prisma, user.id, smartListClause(this.key(row.key), input), clock),
      ),
    );
    return {
      items: rows.map((row, index) => this.toJson(row, counts[index] ?? 0)),
    };
  }

  async update(
    user: AuthUser,
    dto: UpdateSmartListsDto,
  ): Promise<{ items: SmartListResponseDto[] }> {
    const keys = dto.items.map((item) => item.key);
    if (
      keys.length !== SMART_LIST_KEYS.length ||
      new Set(keys).size !== keys.length ||
      SMART_LIST_KEYS.some((key) => !keys.includes(key))
    ) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'smart list order must include every system list once',
      );
    }
    const orders = rebalancedSortOrders(keys.length);
    await this.prisma.$transaction(async (tx) => {
      await this.ensure(tx, user.id);
      const current = await tx.smartList.findMany({ where: { ownerId: user.id, deletedAt: null } });
      const byKey = new Map(current.map((row) => [row.key, row]));
      for (const [index, item] of dto.items.entries()) {
        const key = this.key(item.key);
        const row = byKey.get(key);
        const sortOrder = orders[index];
        if (row === undefined || sortOrder === undefined) {
          throw new DomainException(HttpStatus.NOT_FOUND, 'not_found', 'Smart list was not found');
        }
        const enabled = FIXED_SMART_LIST_KEYS.includes(key) || item.enabled;
        if (row.enabled === enabled && row.sortOrder === sortOrder) {
          continue;
        }
        const updated = await tx.smartList.update({
          where: { id: row.id },
          data: { enabled, sortOrder },
        });
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.smartListUpdated,
          entityType: 'smart_list',
          entityId: row.id,
          action: 'updated',
          data: {
            smart_list: {
              id: updated.id,
              key,
              enabled: updated.enabled,
              sort_order: updated.sortOrder.toString(),
            },
          },
          previous: { enabled: row.enabled, sort_order: row.sortOrder.toString() },
        });
      }
    });
    return this.list(user);
  }

  async tasks(
    user: AuthUser,
    keyRaw: string,
    groupBy: string | undefined,
    sort: string | undefined,
    limit: number,
    cursorRaw: string | undefined,
  ): Promise<ViewPageJson> {
    const key = this.key(keyRaw);
    await this.ensureOnce(user.id);
    const view = parseTaskView(groupBy, sort);
    if (!view.ok) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', view.reason);
    }
    const clock = this.clock(user);
    const input = {
      clock,
      inboxProjectId: await this.inboxId(user.id),
      assigneeId: user.id,
    };
    return pageViewTasks(this.prisma, {
      ownerId: user.id,
      clause: smartListClause(key, input),
      clock,
      groupBy: view.groupBy,
      sort: view.sort,
      limit,
      cursor: this.cursor(cursorRaw),
      ...(key === 'completed' ? { ranking: 'completed' as const } : {}),
    });
  }

  private async ensureOnce(ownerId: string): Promise<void> {
    if (readyOwners.has(ownerId)) {
      return;
    }
    await this.prisma.$transaction((tx) => this.ensure(tx, ownerId));
    readyOwners.add(ownerId);
  }

  private async ensure(tx: Tx, ownerId: string): Promise<void> {
    const existing = await tx.smartList.findMany({ where: { ownerId } });
    const byKey = new Map(existing.map((row) => [row.key, row]));
    const orders = rebalancedSortOrders(SMART_LIST_KEYS.length);
    for (const [index, key] of SMART_LIST_KEYS.entries()) {
      const row = byKey.get(key);
      const sortOrder = orders[index] ?? 0n;
      if (row === undefined) {
        await tx.smartList.create({
          data: { ownerId, key, enabled: true, sortOrder },
        });
      } else if (row.deletedAt !== null) {
        await tx.smartList.update({
          where: { id: row.id },
          data: { deletedAt: null, enabled: true },
        });
      }
    }
  }

  private async inboxId(ownerId: string): Promise<string | null> {
    const inbox = await this.prisma.project.findFirst({
      where: { ownerId, isInbox: true, deletedAt: null },
      select: { id: true },
    });
    return inbox?.id ?? null;
  }

  private key(value: string): SmartListKey {
    if (!isSmartListKey(value)) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'not_found', 'Smart list was not found');
    }
    return value;
  }

  private cursor(raw: string | undefined): { index: number; id: string } | null {
    if (raw === undefined || raw.length === 0) {
      return null;
    }
    const cursor = decodeCursor(raw);
    return { index: Number(cursor.sortOrder), id: cursor.id };
  }

  private clock(user: AuthUser): FilterClock {
    return { now: new Date().toISOString(), timeZone: user.timeZone };
  }

  private toJson(row: SmartList, taskCount: number): SmartListResponseDto {
    return {
      id: row.id,
      key: row.key,
      enabled: FIXED_SMART_LIST_KEYS.includes(row.key) || row.enabled,
      sort_order: row.sortOrder.toString(),
      task_count: taskCount,
    };
  }
}
