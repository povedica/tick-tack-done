import type { Messages } from '../../i18n';

export function activityText(action: string, messages: Messages): string {
  switch (action) {
    case 'created':
      return messages.activityCreated;
    case 'completed':
      return messages.activityCompleted;
    case 'moved':
      return messages.activityMoved;
    case 'updated':
      return messages.activityUpdated;
    case 'deleted':
      return messages.activityDeleted;
    case 'restored':
      return messages.activityRestored;
    case 'commented':
      return messages.activityCommented;
    case 'snoozed':
      return messages.activitySnoozed;
    default:
      return messages.activityUpdated;
  }
}

export function weeklyRule(due: string | null, timeZone: string): string {
  if (due === null) {
    return 'RRULE:FREQ=WEEKLY;BYDAY=MO';
  }
  const name = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(
    new Date(due),
  );
  const codes: Readonly<Record<string, string>> = {
    Sun: 'SU',
    Mon: 'MO',
    Tue: 'TU',
    Wed: 'WE',
    Thu: 'TH',
    Fri: 'FR',
    Sat: 'SA',
  };
  return `RRULE:FREQ=WEEKLY;BYDAY=${codes[name] ?? 'MO'}`;
}

export function toLocal(value: string | null): string {
  if (value === null) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function relativeTime(iso: string, locale: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(delta)) {
    return iso;
  }
  const minutes = Math.round(delta / 60_000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(minutes) < 60) {
    return format.format(-minutes, 'minute');
  }
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 36) {
    return format.format(-hours, 'hour');
  }
  return format.format(-Math.round(hours / 24), 'day');
}
