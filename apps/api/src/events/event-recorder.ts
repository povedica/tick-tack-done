import { Injectable } from '@nestjs/common';
import { Prisma, type ActivityAction } from '@prisma/client';
import type { EventActor } from '../auth/auth-user.js';
import type { Tx } from '../prisma/tx.js';

export interface RecordedEvent {
  readonly type: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: ActivityAction;
  readonly data: Prisma.InputJsonValue;
  readonly previous: Prisma.InputJsonValue | null;
}

@Injectable()
export class EventRecorder {
  async record(tx: Tx, actor: EventActor, event: RecordedEvent): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        ownerId: actor.ownerId,
        type: event.type,
        actorKind: actor.actorKind,
        actorId: actor.tokenId ?? actor.actorId,
        data: event.data,
        previous: event.previous ?? Prisma.DbNull,
      },
    });
    await tx.activityLog.create({
      data: {
        ownerId: actor.ownerId,
        actorId: actor.actorId,
        tokenId: actor.tokenId,
        entityType: event.entityType,
        entityId: event.entityId,
        action: event.action,
        changes:
          event.previous === null ? event.data : { data: event.data, previous: event.previous },
      },
    });
  }
}
