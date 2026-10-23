import { PrismaClient } from '../apps/api/node_modules/@prisma/client/index.js';
import { repairAllDayUtc } from '../packages/domain/src/tasks/repair-allday';
import { backupBeforeApply, maintenanceMode } from './data-safety';
async function main(): Promise<void> {
  const mode = maintenanceMode();
  const db = new PrismaClient();
  try {
    const rows = await db.task.findMany({
      where: { isAllDay: true, deletedAt: null },
      select: {
        id: true,
        ownerId: true,
        dueDate: true,
        startDate: true,
        timeZone: true,
        repeatRule: true,
        updatedAt: true,
      },
    });
    const changes = rows.flatMap((row) => {
      const due =
        row.dueDate === null ? null : repairAllDayUtc(row.dueDate.toISOString(), row.timeZone);
      const start =
        row.startDate === null ? null : repairAllDayUtc(row.startDate.toISOString(), row.timeZone);
      return due === null && start === null ? [] : [{ row, due, start }];
    });
    console.log(
      JSON.stringify({
        dry_run: mode.dryRun,
        count: changes.length,
        ids: changes.map((change) => change.row.id),
      }),
    );
    if (mode.dryRun) return;
    backupBeforeApply(mode.backup ?? '');
    for (const { row, due, start } of changes)
      await db.$transaction(async (tx) => {
        // A recurrence carries a civil anchor of its own: leave its rule untouched.
        const updated = await tx.task.updateMany({
          where: { id: row.id, ownerId: row.ownerId, updatedAt: row.updatedAt, isAllDay: true },
          data: {
            ...(due ? { dueDate: new Date(due) } : {}),
            ...(start ? { startDate: new Date(start) } : {}),
          },
        });
        if (updated.count === 0) console.log(JSON.stringify({ skipped_concurrent_update: row.id }));
        else {
          const data = {
            id: row.id,
            source: 'maintenance',
            due_date: due ?? row.dueDate?.toISOString() ?? null,
            start_date: start ?? row.startDate?.toISOString() ?? null,
          };
          await tx.outboxEvent.create({
            data: {
              ownerId: row.ownerId,
              type: 'task.updated@v1',
              actorKind: 'automation',
              actorId: row.ownerId,
              data,
              previous: {
                due_date: row.dueDate?.toISOString() ?? null,
                start_date: row.startDate?.toISOString() ?? null,
              },
            },
          });
        }
      });
  } finally {
    await db.$disconnect();
  }
}
void main().catch(() => {
  console.error('All-day repair failed; no credentials logged');
  process.exitCode = 1;
});
