import { addCalendarDays, dayKey } from '@reflexionia/domain';
import { zonedWallTime } from '../today/groups';
/** RF-604/706: shift calendar days in the captured zone, preserving wall time across DST. */
export function anchorFix(
  task: {
    due_date: string | null;
    start_date: string | null;
    time_zone: string;
    is_all_day: boolean;
  },
  next: string,
) {
  if (!task.due_date) throw new Error('Missing anchor');
  const dueDay = dayKey(task.due_date, task.time_zone);
  if (!dueDay) throw new Error('Invalid anchor');
  // Both operands are date-only UTC labels, never instants in the captured zone.
  const delta = Math.round(
    (Date.parse(`${next}T00:00:00Z`) - Date.parse(`${dueDay}T00:00:00Z`)) / 86400000,
  );
  const shift = (value: string, target: string) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: task.time_zone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(value));
    const number = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const moved = zonedWallTime(
      target,
      task.is_all_day ? 0 : number('hour'),
      task.is_all_day ? 0 : number('minute'),
      task.time_zone,
    );
    if (!moved) throw new Error('Invalid date');
    const date = new Date(moved);
    if (!task.is_all_day)
      date.setUTCSeconds(number('second'), new Date(value).getUTCMilliseconds());
    return date.toISOString();
  };
  const startDay = task.start_date ? dayKey(task.start_date, task.time_zone) : null;
  return {
    due_date: shift(task.due_date, next),
    ...(task.start_date && startDay
      ? { start_date: shift(task.start_date, addCalendarDays(startDay, delta) ?? startDay) }
      : {}),
  };
}
