import { PrismaClient } from '../apps/api/node_modules/@prisma/client/index.js';
import { backupBeforeApply, maintenanceMode } from './data-safety';
async function main(): Promise<void> {
  const mode = maintenanceMode();
  const db = new PrismaClient();
  const record = (value: unknown): Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  try {
    // Direct links plus auditable links lost by the old update (which cleared series_id).
    const candidates = await db.task.findMany({
      where: { status: 'active', repeatRule: null, recurrenceOpen: true, deletedAt: null },
      select: { id: true, ownerId: true, seriesId: true, updatedAt: true },
    });
    const proven = new Map<string, { ownerId: string; taskId: string; seriesId: string }>();
    for (const task of candidates) {
      let seriesId = task.seriesId;
      if (seriesId === null) {
        const activity = await db.activityLog.findFirst({
          where: {
            ownerId: task.ownerId,
            entityType: 'task',
            entityId: task.id,
            action: 'updated',
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
          select: { changes: true },
        });
        const changes = record(activity?.changes);
        const previous = record(changes.previous);
        const current = record(record(changes.data).task);
        if (
          current.repeat_rule === null &&
          typeof previous.repeat_rule === 'string' &&
          typeof previous.series_id === 'string'
        )
          seriesId = previous.series_id;
      }
      if (seriesId !== null)
        proven.set(seriesId, { ownerId: task.ownerId, taskId: task.id, seriesId });
    }
    console.log(
      JSON.stringify({
        dry_run: mode.dryRun,
        series: [...proven.values()].map((row) => row.seriesId),
        count: proven.size,
      }),
    );
    if (!mode.dryRun) {
      backupBeforeApply(mode.backup ?? '');
      for (const row of proven.values())
        await db.$transaction(async (tx) => {
          const key = `recurrence-series:${row.ownerId}:${row.seriesId}`;
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
          const current = await tx.task.findFirst({
            where: {
              id: row.taskId,
              ownerId: row.ownerId,
              status: 'active',
              repeatRule: null,
              recurrenceOpen: true,
              deletedAt: null,
            },
          });
          if (current === null) return;
          const updated = await tx.task.updateMany({
            where: { ownerId: row.ownerId, seriesId: row.seriesId, recurrenceOpen: true },
            data: { recurrenceOpen: false },
          });
          if (updated.count === 0) return;
          await tx.seriesAdvance.updateMany({
            where: { ownerId: row.ownerId, seriesId: row.seriesId, processedAt: null },
            data: { processedAt: new Date() },
          });
          await tx.outboxEvent.create({
            data: {
              ownerId: row.ownerId,
              type: 'series.closed@v1',
              actorKind: 'automation',
              actorId: row.ownerId,
              data: { series_id: row.seriesId, source: 'maintenance' },
              previous: { recurrence_open: true },
            },
          });
        });
    }
  } finally {
    await db.$disconnect();
  }
}
void main().catch(() => {
  console.error('Series maintenance failed; no further changes attempted');
  process.exitCode = 1;
});
