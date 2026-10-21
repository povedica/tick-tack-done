import { calendarDateKey, shiftLocalDays } from '@reflexionia/domain';
import type { RowModel } from './model';

type Schedule = Pick<
  RowModel,
  'startDate' | 'dueDate' | 'timeZone' | 'isAllDay' | 'durationMinutes'
>;

/** RF-601 RF-602 RF-604: show the effective date and interval in the captured zone. */
export function formatTaskRowDate(
  task: Schedule,
  locale: string,
  now: Date,
  labels: { readonly dateToday: string; readonly dateTomorrow: string },
): string {
  const value = task.startDate ?? task.dueDate;
  if (value === null) return '';
  const date = new Date(value);
  const key = calendarDateKey(value, task.timeZone);
  const tomorrow = shiftLocalDays(now.toISOString(), task.timeZone, 1);
  const day =
    key === calendarDateKey(now.toISOString(), task.timeZone)
      ? labels.dateToday
      : tomorrow !== null && key === calendarDateKey(tomorrow, task.timeZone)
        ? labels.dateTomorrow
        : new Intl.DateTimeFormat(locale, {
            day: 'numeric',
            month: 'short',
            timeZone: task.timeZone,
            ...(key.slice(0, 4) === calendarDateKey(now.toISOString(), task.timeZone).slice(0, 4)
              ? {}
              : { year: 'numeric' }),
          }).format(date);
  if (task.isAllDay) return day;
  const clock = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: task.timeZone,
  });
  const explicitEnd =
    task.startDate !== null && task.dueDate !== null && task.dueDate > task.startDate
      ? new Date(task.dueDate)
      : null;
  const end =
    task.durationMinutes !== null && task.durationMinutes > 0
      ? new Date(date.getTime() + task.durationMinutes * 60_000)
      : explicitEnd;
  if (end === null) return `${day} ${clock.format(date)}`;
  const endDay =
    calendarDateKey(end.toISOString(), task.timeZone) === key
      ? ''
      : `${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: task.timeZone }).format(end)} `;
  return `${day} ${clock.format(date)}–${endDay}${clock.format(end)}`;
}
