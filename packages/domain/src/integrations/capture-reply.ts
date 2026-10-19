import { addCalendarDays, wallClock, type WallClock } from '../dates/zoned';

export interface CaptureReply {
  readonly title: string;
  readonly dueDate: string | null;
  readonly isAllDay: boolean;
  readonly priority: 'none' | 'low' | 'medium' | 'high';
  readonly tags: readonly string[];
  readonly listName: string;
  readonly timeZone: string;
  readonly now: string;
  readonly lead?: string;
}

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;
const MONTHS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

const PRIORITY: Readonly<Record<string, string>> = {
  high: 'Prioridad alta',
  medium: 'Prioridad media',
  low: 'Prioridad baja',
};

/** Spanish confirmation of what a capture channel stored. */
export function formatCaptureReply(input: CaptureReply): string {
  const head = `${input.lead ?? 'Guardada'}: ${input.title}.`;
  const bits: string[] = [];
  const when = whenLabel(input);
  if (when !== null) {
    bits.push(when);
  }
  const priority = PRIORITY[input.priority];
  if (priority !== undefined) {
    bits.push(priority);
  }
  for (const tag of input.tags) {
    bits.push(`#${tag}`);
  }
  if (input.listName.length > 0) {
    bits.push(input.listName);
  }
  if (bits.length === 0) {
    return head;
  }
  return `${head}\n📅 ${bits.join(' · ')}`;
}

function whenLabel(input: CaptureReply): string | null {
  if (input.dueDate === null) {
    return null;
  }
  const due = wallClock(input.dueDate, input.timeZone);
  const today = wallClock(input.now, input.timeZone);
  if (due === null || today === null) {
    return null;
  }
  const day = dayLabel(due, today);
  if (input.isAllDay) {
    return `${day} (todo el día)`;
  }
  return `${day}, ${pad(due.hour)}:${pad(due.minute)}`;
}

function dayLabel(due: WallClock, today: WallClock): string {
  if (sameDay(due, today)) {
    return 'Hoy';
  }
  if (sameDay(due, addCalendarDays(today, 1))) {
    return 'Mañana';
  }
  const weekday = WEEKDAYS[new Date(Date.UTC(due.year, due.month - 1, due.day)).getUTCDay()];
  const month = MONTHS[due.month - 1];
  return `${weekday ?? 'Día'} ${String(due.day)} ${month ?? ''}`;
}

function sameDay(left: WallClock, right: WallClock): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
