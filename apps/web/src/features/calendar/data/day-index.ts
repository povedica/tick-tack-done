import { calendarDateKey } from '@reflexionia/domain';
import type { ExternalEventView } from '../ExternalEvent';
import { eventDayRange } from '../../places/event-span';

export interface CalendarDayTask {
  readonly start_date?: string | null;
  readonly due_date: string | null;
  readonly time_zone?: string | null;
}

export interface CalendarDayIndex<T extends CalendarDayTask> {
  readonly tasks: ReadonlyMap<string, readonly T[]>;
  readonly events: ReadonlyMap<string, readonly ExternalEventView[]>;
}

/**
 * One pass over the visible tasks and events. A task lands on its effective
 * civil day (start, otherwise due), the same rule as the year index.
 * Event days reuse the cached event range.
 */
export function buildCalendarDayIndex<T extends CalendarDayTask>(
  tasks: readonly T[],
  events: readonly ExternalEventView[],
  timeZone = 'Europe/Madrid',
  eventZone?: string,
): CalendarDayIndex<T> {
  const tasksByDay = new Map<string, T[]>();
  for (const task of tasks) {
    const effective = task.start_date ?? task.due_date;
    if (effective === null || effective.length === 0) {
      continue;
    }
    const key = calendarDateKey(effective, task.time_zone ?? timeZone);
    const list = tasksByDay.get(key);
    if (list === undefined) {
      tasksByDay.set(key, [task]);
    } else {
      list.push(task);
    }
  }
  const eventsByDay = new Map<string, ExternalEventView[]>();
  for (const event of events) {
    const { start, end } =
      eventZone === undefined ? eventDayRange(event) : eventDayRange(event, eventZone);
    for (let key: string | null = start; key !== null && key <= end; key = nextCivilDay(key)) {
      const list = eventsByDay.get(key);
      if (list === undefined) {
        eventsByDay.set(key, [event]);
      } else {
        list.push(event);
      }
    }
  }
  return { tasks: tasksByDay, events: eventsByDay };
}

export function tasksForDay<T extends CalendarDayTask>(
  index: CalendarDayIndex<T>,
  key: string,
): readonly T[] {
  return index.tasks.get(key) ?? [];
}

export function eventsForDay<T extends CalendarDayTask>(
  index: CalendarDayIndex<T>,
  key: string,
): readonly ExternalEventView[] {
  return index.events.get(key) ?? [];
}

function nextCivilDay(key: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
    return null;
  }
  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
  const iso = next.toISOString().slice(0, 10);
  return iso > key ? iso : null;
}
