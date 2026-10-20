import type { PrismaService } from '../prisma/prisma.service.js';

/** Canonical overdue set (DAT-1): same SQL for badge, Jardín and Revisión. */
export async function countOverdueTasks(prisma: PrismaService, ownerId: string): Promise<number> {
  const rows = await listOverdueTaskIds(prisma, ownerId);
  return rows.length;
}

export async function listOverdueTaskIds(
  prisma: PrismaService,
  ownerId: string,
): Promise<string[]> {
  return (await listOverdueTaskRows(prisma, ownerId)).map((row) => row.id);
}

export async function listOverdueTaskRows(prisma: PrismaService, ownerId: string) {
  return prisma.$queryRaw<
    { id: string; list_id: string | null; name: string; days_overdue: number }[]
  >`
    SELECT t.id, t.project_id AS list_id, COALESCE(p.name, 'Sin lista') AS name,
      GREATEST(0, (NOW() AT TIME ZONE t.time_zone)::date - (t.due_date AT TIME ZONE t.time_zone)::date)::int AS days_overdue
    FROM tasks t LEFT JOIN projects p ON p.id = t.project_id AND p.owner_id = t.owner_id
    WHERE t.owner_id = CAST(${ownerId} AS uuid)
      AND t.deleted_at IS NULL
      AND t.status = 'active'::"TaskStatus"
      AND t.due_date IS NOT NULL
      AND (
        (t.is_all_day = false AND t.due_date < NOW())
        OR (
          t.is_all_day = true
          AND (t.due_date AT TIME ZONE t.time_zone)::date < (NOW() AT TIME ZONE t.time_zone)::date
        )
      )
  `;
}
