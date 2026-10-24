import { PrismaClient } from '@prisma/client';
import { DomainEvent } from '../src/events/domain-events.js';
import { EventRecorder } from '../src/events/event-recorder.js';

/** Idempotent safety cleanup after migration; never contacts Telegram or loads an env file. */
const prisma = new PrismaClient();
try {
  await prisma.$transaction(async (tx) => {
    const configured = await tx.telegramBotConfiguration.findMany({ select: { ownerId: true } });
    const links = await tx.telegramLink.findMany({
      where: {
        deletedAt: null,
        botId: null,
        ownerId: { notIn: configured.map((row) => row.ownerId) },
      },
    });
    const events = new EventRecorder();
    for (const link of links) {
      const removed = await tx.telegramLink.updateMany({
        where: { id: link.id, deletedAt: null, botId: null },
        data: { deletedAt: new Date() },
      });
      if (!removed.count) continue;
      await events.record(
        tx,
        { ownerId: link.ownerId, actorId: link.ownerId, actorKind: 'user', tokenId: null },
        {
          type: DomainEvent.telegramLegacyUnlinked,
          entityType: 'telegram_link',
          entityId: link.id,
          action: 'deleted',
          data: { link_id: link.id, reason: 'legacy_bot_removed' },
          previous: null,
        },
      );
    }
  });
} finally {
  await prisma.$disconnect();
}
