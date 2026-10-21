import type { DashboardHabit, DashboardSnapshot, DashboardTask } from '@reflexionia/domain';
import { dashboardSnapshot } from '@reflexionia/domain';
import type { PrismaService } from '../prisma/prisma.service.js';
import { countOverdueTasks } from './overdue.js';

/** Shared read of the user's tasks and habits. Widgets and the weekly report use this, not a second formula. */
export async function loadDashboardSnapshot(
  prisma: PrismaService,
  ownerId: string,
  now: Date,
  timeZone = 'UTC',
): Promise<DashboardSnapshot> {
  const tasks = await prisma.task.findMany({
    where: { ownerId, deletedAt: null },
    select: {
      createdAt: true,
      completedAt: true,
      dueDate: true,
      status: true,
      projectId: true,
      project: { select: { name: true } },
      tags: { select: { tag: { select: { name: true } } } },
    },
  });
  const habits = await prisma.habit.findMany({
    where: { ownerId, deletedAt: null, archived: false },
    select: {
      goal: true,
      logs: { where: { deletedAt: null }, select: { date: true, count: true } },
    },
  });
  const mappedTasks: DashboardTask[] = tasks.map((task) => ({
    createdAt: task.createdAt.toISOString(),
    completedAt: task.completedAt?.toISOString() ?? null,
    dueDate: task.dueDate?.toISOString() ?? null,
    status: task.status,
    listId: task.projectId,
    listName: task.project.name,
    tagNames: task.tags.map((link) => link.tag.name),
  }));
  const mappedHabits: DashboardHabit[] = habits.map((habit) => ({
    name: '',
    targetCount: targetOf(habit.goal),
    checks: habit.logs.map((log) => ({
      date: log.date.toISOString().slice(0, 10),
      count: log.count,
    })),
  }));
  const snapshot = dashboardSnapshot(mappedTasks, mappedHabits, now.toISOString(), timeZone);
  // DAT-1: overdue matches the badge SQL (all-day uses the calendar day in the task zone).
  const overdue = await countOverdueTasks(prisma, ownerId);
  return { ...snapshot, overdue };
}

function targetOf(goal: unknown): number {
  if (typeof goal !== 'object' || goal === null) {
    return 1;
  }
  const record = goal as { target_count?: unknown; targetCount?: unknown };
  const value = record.target_count ?? record.targetCount;
  return typeof value === 'number' && value > 0 ? value : 1;
}
