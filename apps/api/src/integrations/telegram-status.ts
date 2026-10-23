import type { PrismaService } from '../prisma/prisma.service.js';
import { EventRecorder } from '../events/event-recorder.js';
import { DomainEvent } from '../events/domain-events.js';
/** Transport state belongs to the linked owner; record only real transitions. */
export async function setTelegramStatus(
  prisma: PrismaService,
  ownerId: string,
  status: 'blocked' | 'connected',
) {
  await prisma.$transaction(async (tx) => {
    const changed = await tx.telegramLink.updateMany({
      where: { ownerId, deletedAt: null, status: { not: status } },
      data: { status },
    });
    if (changed.count)
      await new EventRecorder().record(
        tx,
        { ownerId, actorId: ownerId, actorKind: 'automation', tokenId: null },
        {
          type: DomainEvent.telegramStatusChanged,
          entityType: 'telegram_link',
          entityId: ownerId,
          action: 'updated',
          data: { status },
          previous: null,
        },
      );
  });
}
