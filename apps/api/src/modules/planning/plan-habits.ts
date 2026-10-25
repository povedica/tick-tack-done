import { readStoredHabit, type PlanCard } from '@reflexionia/domain';
import type { AuthUser } from '../../auth/auth-user.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
/** A habit is represented by this civil day's occurrence; the series is never edited. */
export async function habitCards(
  prisma: PrismaService,
  user: AuthUser,
  date: string,
): Promise<PlanCard[]> {
  if (!user.scopes.includes('habits:read') || user.listIds !== null) return [];
  const weekday = (
    ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
  )[new Date(`${date}T12:00Z`).getUTCDay()];
  const habits = await prisma.habit.findMany({
    where: { ownerId: user.id, deletedAt: null, archived: false },
    include: { logs: { where: { date: new Date(`${date}T00:00Z`), deletedAt: null } } },
  });
  const plan = await prisma.dayPlan.findUnique({
    where: {
      ownerId_localDate_timeZone: { ownerId: user.id, localDate: date, timeZone: user.timeZone },
    },
    include: {
      sessions: {
        where: { state: 'applied' },
        include: { operations: { where: { status: 'applied' } }, decisions: true },
      },
    },
  });
  const removed = new Set(
    (plan?.sessions ?? [])
      .filter((s) => s.operations.length > 0)
      .flatMap((s) =>
        s.decisions
          .filter(
            (d) =>
              ['done', 'cancel', 'trash', 'someday'].includes(d.decision) ||
              (d.targetDate !== null && d.targetDate !== date),
          )
          .map((d) => d.taskId),
      ),
  );
  return habits.flatMap((habit) => {
    const config = readStoredHabit(habit.goal, habit.frequency, habit.reminderTime);
    if (
      !config ||
      !weekday ||
      !config.days.includes(weekday) ||
      removed.has(habit.id) ||
      (habit.logs[0]?.count ?? 0) >= config.goal.targetCount
    )
      return [];
    return [
      {
        taskId: habit.id,
        title: habit.name,
        content: habit.motivationNote ?? '',
        section: 'today' as const,
        reason: 'planned_today' as const,
        reasonText: '',
        priority: 'none' as const,
        dueDate: null,
        startDate: date,
        isAllDay: true,
        timeZone: user.timeZone,
        projectId: '',
        projectName: '',
        projectColor: habit.color,
        updatedAt: habit.updatedAt.toISOString(),
        rank: 0,
        recurring: true,
        repeatRule: null,
        habit: true,
        durationMinutes: null,
        tags: [],
        attachments: [],
      },
    ];
  });
}
