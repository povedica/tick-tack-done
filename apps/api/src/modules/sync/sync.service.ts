import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { isTombstoneType, syncLimit, tombstoneCutoff } from '@reflexionia/domain';
import type { AuthUser } from '../../auth/auth-user';
import { DomainException } from '../../http/domain.exception';
import { PrismaService } from '../../prisma/prisma.service';

export interface SyncChange {
  readonly event_id: string;
  readonly type: string;
  readonly occurred_at: string;
  readonly op: 'upsert' | 'tombstone';
  readonly entity_type: string;
  readonly entity_id: string | null;
  readonly data: unknown;
}

@Injectable()
export class SyncService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async delta(
    user: AuthUser,
    since: string | undefined,
    limitRaw: string | undefined,
  ): Promise<{ changes: SyncChange[]; next_cursor: string | null }> {
    const parsed = limitRaw === undefined ? undefined : Number(limitRaw);
    const limit = syncLimit(parsed);
    if (limit === null) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'limit is out of range',
      );
    }
    const cursor = await this.cursor(user.id, since);
    const cutoff = tombstoneCutoff(new Date());
    const rows = await this.prisma.outboxEvent.findMany({
      where: {
        ownerId: user.id,
        ...(cursor === null
          ? {}
          : {
              OR: [
                { occurredAt: { gt: cursor.occurredAt } },
                { occurredAt: cursor.occurredAt, id: { gt: cursor.id } },
              ],
            }),
        NOT: { AND: [{ type: { contains: '.deleted@' } }, { occurredAt: { lt: cutoff } }] },
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      changes: page.map((row) => ({
        event_id: row.id,
        type: row.type,
        occurred_at: row.occurredAt.toISOString(),
        op: isTombstoneType(row.type) ? 'tombstone' : 'upsert',
        entity_type: row.type.split('.')[0] ?? 'unknown',
        entity_id: entityId(row.data),
        data: row.data,
      })),
      next_cursor: rows.length > limit && last !== undefined ? last.id : null,
    };
  }

  private async cursor(
    ownerId: string,
    since: string | undefined,
  ): Promise<{ id: string; occurredAt: Date } | null> {
    if (since === undefined || since.length === 0) {
      return null;
    }
    const row = await this.prisma.outboxEvent.findFirst({
      where: { id: since, ownerId },
      select: { id: true, occurredAt: true },
    });
    if (row === null) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'invalid_cursor',
        'Sync cursor was not found',
      );
    }
    return row;
  }
}

function entityId(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;
  if (typeof record.id === 'string') {
    return record.id;
  }
  for (const value of Object.values(record)) {
    if (typeof value === 'object' && value !== null && 'id' in value) {
      const id = (value as { id?: unknown }).id;
      if (typeof id === 'string') {
        return id;
      }
    }
  }
  return null;
}
