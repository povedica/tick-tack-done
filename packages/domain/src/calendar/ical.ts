/** RF-1103 and RF-1104. A small iCalendar reader and writer. Not a general RFC 5545 stack. */

export interface IcalTask {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly startDate: string | null;
  readonly dueDate: string | null;
  readonly isAllDay: boolean;
}

export interface IcalEvent {
  readonly uid: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly isAllDay: boolean;
}

export function tasksToIcal(
  calendarName: string,
  tasks: readonly IcalTask[],
  nowIso: string,
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Reflexionia//Tasks//ES',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const task of tasks) {
    if (task.dueDate === null && task.startDate === null) {
      continue;
    }
    const start = task.startDate ?? task.dueDate;
    const end = task.dueDate ?? task.startDate;
    if (start === null || end === null) {
      continue;
    }
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeText(task.id)}@todo.reflexionia.com`,
      `DTSTAMP:${toIcalStamp(nowIso)}`,
      `SUMMARY:${escapeText(task.title)}`,
      task.content.length > 0 ? `DESCRIPTION:${escapeText(task.content)}` : '',
      task.isAllDay ? `DTSTART;VALUE=DATE:${toIcalDate(start)}` : `DTSTART:${toIcalStamp(start)}`,
      task.isAllDay ? `DTEND;VALUE=DATE:${toIcalDate(end)}` : `DTEND:${toIcalStamp(end)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.filter((line) => line.length > 0).join('\r\n');
}

/** External calendars are read-only. Malformed text yields no events. */
export function parseIcal(source: string): readonly IcalEvent[] {
  const unfolded = source.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const events: IcalEvent[] = [];
  const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);
  for (const block of blocks) {
    const body = block.split(/END:VEVENT/i)[0] ?? '';
    const fields = readFields(body);
    const uid = fields.uid ?? '';
    const start = fields.dtstart ?? '';
    if (uid.length === 0 || start.length === 0) {
      continue;
    }
    const startsAt = fromIcal(start);
    if (startsAt === null) {
      continue;
    }
    const endRaw = fields.dtend ?? '';
    events.push({
      uid,
      title: unescapeText(fields.summary ?? 'Evento'),
      startsAt,
      endsAt: endRaw.length === 0 ? null : fromIcal(endRaw),
      isAllDay: start.length === 8,
    });
  }
  return events;
}

function readFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const raw of body.split(/\r\n|\n|\r/)) {
    const line = raw.trim();
    const split = line.indexOf(':');
    if (split <= 0) {
      continue;
    }
    const name = (line.slice(0, split).split(';')[0] ?? '').toLowerCase();
    if (name.length === 0) {
      continue;
    }
    fields[name] = line.slice(split + 1);
  }
  return fields;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function toIcalStamp(iso: string): string {
  return (
    iso
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '')
      .replace('Z', '') + (iso.endsWith('Z') ? 'Z' : '')
  );
}

function toIcalDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '');
}

function fromIcal(value: string): string | null {
  if (/^\d{8}$/.test(value)) {
    const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`;
    return Number.isNaN(Date.parse(iso)) ? null : iso;
  }
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(value);
  const year = match?.[1];
  const month = match?.[2];
  const day = match?.[3];
  const hour = match?.[4];
  const minute = match?.[5];
  const second = match?.[6];
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    return null;
  }
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}
