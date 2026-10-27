import { isOverdue } from '../dates/schedule';
import { wallClock } from '../dates/zoned';

export interface DigestTask {
  readonly title: string;
  readonly dueDate: string;
  readonly startDate?: string | null | undefined;
  readonly isAllDay: boolean;
  readonly timeZone: string;
}

/**
 * NT-14. The morning digest lists still-overdue tasks and tasks due that local day.
 * One-shot overdue signals are not a substitute: a task stays listed until it is done.
 */
export function formatDailyDigest(input: {
  readonly tasks: readonly DigestTask[];
  readonly now: string;
  readonly fireAt: string;
}): string {
  const overdue: string[] = [];
  const today: string[] = [];
  for (const task of input.tasks) {
    const late = isOverdue({
      status: 'active',
      dueDate: task.dueDate,
      startDate: task.startDate,
      isAllDay: task.isAllDay,
      timeZone: task.timeZone,
      now: input.now,
    });
    if (late) {
      overdue.push(task.title);
      continue;
    }
    if (sameLocalDay(task.dueDate, input.fireAt, task.timeZone)) {
      today.push(task.title);
    }
  }
  const parts: string[] = [];
  if (overdue.length > 0) {
    parts.push(['Vencidas', ...overdue.map((title) => `- ${title}`)].join('\n'));
  }
  if (today.length > 0) {
    parts.push(['Hoy', ...today.map((title) => `- ${title}`)].join('\n'));
  }
  if (parts.length === 0) {
    return 'No hay tareas con fecha para hoy.';
  }
  return parts.join('\n\n');
}

function sameLocalDay(dueIso: string, fireIso: string, timeZone: string): boolean {
  const due = wallClock(dueIso, timeZone);
  const fire = wallClock(fireIso, timeZone);
  if (due === null || fire === null) {
    return false;
  }
  return due.year === fire.year && due.month === fire.month && due.day === fire.day;
}
