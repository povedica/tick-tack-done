import type { Task } from '@reflexionia/sdk';
import { dateTimeFormat } from '../../../lib/dates/formatters';
import { calendarTaskLabel } from '../../places/month';
import { formatDueTime } from '../../today/groups';
import { eventDayRange } from '../../places/event-span';
import type { ExternalEventView } from '../ExternalEvent';

export function chipLabel(task: Task, untitled: string, locale: string): string {
  const title = calendarTaskLabel(task.title, task.due_date, task.time_zone, untitled);
  if (task.due_date === null || task.is_all_day) {
    return title;
  }
  const zone = task.time_zone.length > 0 ? task.time_zone : 'UTC';
  return `${formatDueTime(task.due_date, zone, locale)} ${title}`;
}

export function eventsOnDay(events: readonly ExternalEventView[], day: Date): ExternalEventView[] {
  const key = localKey(day);
  return events.filter((event) => {
    const { start, end } = eventDayRange(event);
    return key >= start && key <= end;
  });
}

export function mixChips(
  tasks: readonly Task[],
  events: readonly ExternalEventView[],
): (
  | { kind: 'task'; task: Task; sort: string }
  | { kind: 'event'; event: ExternalEventView; sort: string }
)[] {
  const chips = [
    ...tasks.map((task) => ({
      kind: 'task' as const,
      task,
      sort: `${task.is_all_day ? '0' : '1'}-${task.due_date ?? ''}`,
    })),
    ...events.map((event) => ({
      kind: 'event' as const,
      event,
      sort: `${event.is_all_day ? '0' : '1'}-${event.starts_at}`,
    })),
  ];
  return chips.sort((left, right) => left.sort.localeCompare(right.sort));
}

export function clockLabel(iso: string, locale: string): string {
  return dateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function localKey(day: Date): string {
  if (Number.isNaN(day.getTime())) {
    return '';
  }
  const month = String(day.getMonth() + 1).padStart(2, '0');
  const date = String(day.getDate()).padStart(2, '0');
  return `${String(day.getFullYear())}-${month}-${date}`;
}
