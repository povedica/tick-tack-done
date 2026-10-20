import { gardenProjectContext } from '@reflexionia/domain';
import type { PrismaService } from '../prisma/prisma.service.js';

export async function loadGardenProjects(prisma: PrismaService, ownerId: string, now: Date) {
  const week = new Date(now.getTime() - 7 * 86_400_000);
  const where = { ownerId, deletedAt: null };
  const [projects, active, created, completed, activity] = await Promise.all([
    prisma.project.findMany({
      where: { ownerId, isInbox: false, OR: [{ deletedAt: null }, { deletedAt: { gte: week } }] },
      select: { id: true, name: true, kind: true, closed: true, createdAt: true, deletedAt: true },
      orderBy: { name: 'asc' },
    }),
    prisma.task.groupBy({ by: ['projectId'], where: { ...where, status: 'active' }, _count: true }),
    prisma.task.groupBy({
      by: ['projectId'],
      where: { ...where, createdAt: { gte: week, lte: now } },
      _count: true,
    }),
    prisma.task.groupBy({
      by: ['projectId'],
      where: { ...where, completedAt: { gte: week, lte: now } },
      _count: true,
    }),
    prisma.task.groupBy({ by: ['projectId'], where: { ownerId }, _max: { updatedAt: true } }),
  ]);
  const activeCounts = new Map(active.map((item) => [item.projectId, item._count]));
  const createdCounts = new Map(created.map((item) => [item.projectId, item._count]));
  const completedCounts = new Map(completed.map((item) => [item.projectId, item._count]));
  const lastActivity = new Map(
    activity.map((item) => [item.projectId, item._max.updatedAt?.toISOString() ?? null]),
  );
  return gardenProjectContext(
    projects.map((project) => ({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt.toISOString(),
      deletedAt: project.deletedAt?.toISOString() ?? null,
      closed: project.closed,
      isNote: project.kind === 'NOTE',
      activeTasks: activeCounts.get(project.id) ?? 0,
      created7d: createdCounts.get(project.id) ?? 0,
      completed7d: completedCounts.get(project.id) ?? 0,
      lastTaskActivity: lastActivity.get(project.id) ?? null,
    })),
    now.toISOString(),
  );
}
