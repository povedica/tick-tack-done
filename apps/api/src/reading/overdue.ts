import type { PrismaService } from '../prisma/prisma.service.js';

/** Canonical overdue set (DAT-1): same SQL for badge, Jardín and Revisión. */
export async function countOverdueTasks(prisma: PrismaService, ownerId: string): Promise<number> {
  const rows = await listOverdueTaskIds(prisma, ownerId);
  return rows.length;
}

export async function listOverdueTaskIds(prisma: PrismaService, ownerId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM tasks
    WHERE owner_id = CAST(${ownerId} AS uuid)
      AND deleted_at IS NULL
      AND status = 'active'::"TaskStatus"
      AND due_date IS NOT NULL
      AND (
        (is_all_day = false AND due_date < NOW())
        OR (
          is_all_day = true
          AND (due_date AT TIME ZONE time_zone)::date < (NOW() AT TIME ZONE time_zone)::date
        )
      )
  `;
  return rows.map((row) => row.id);
}
