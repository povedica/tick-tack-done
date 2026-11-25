import type { Priority } from '@reflexionia/domain';
import type { MailLocale } from './html.js';

export interface PriorityMark {
  readonly color: string;
  readonly mark: string;
  readonly label: string;
}

const COPY: Record<
  Exclude<Priority, 'none'>,
  { color: string; mark: string; es: string; en: string }
> = {
  high: { color: '#e13e39', mark: '&#9650;', es: 'Prioridad alta', en: 'High priority' },
  medium: { color: '#e08f00', mark: '&#9632;', es: 'Prioridad media', en: 'Medium priority' },
  low: { color: '#4772FA', mark: '&#9660;', es: 'Prioridad baja', en: 'Low priority' },
};

export function priorityMark(priority: Priority, locale: MailLocale): PriorityMark | null {
  if (priority === 'none') {
    return null;
  }
  const row = COPY[priority];
  return {
    color: row.color,
    mark: row.mark,
    label: locale === 'en' ? row.en : row.es,
  };
}

export function priorityBarColor(priority: Priority): string {
  return priorityMark(priority, 'es')?.color ?? '#c9ccd6';
}

export function priorityShort(priority: Priority, locale: MailLocale): string | null {
  const mark = priorityMark(priority, locale);
  if (mark === null) {
    return null;
  }
  if (locale === 'en') {
    return mark.label;
  }
  if (priority === 'high') {
    return 'Alta';
  }
  if (priority === 'medium') {
    return 'Media';
  }
  return 'Baja';
}
