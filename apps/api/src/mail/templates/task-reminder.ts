import type { Priority } from '@reflexionia/domain';
import { titleForEmail } from '@reflexionia/domain';
import {
  displayTitle,
  emailButton,
  escapeHtml,
  MAIL_FONT,
  mailLocale,
  plainNote,
  type MailLocale,
  type RenderedMail,
} from './html.js';
import { mailOrigin, renderEmailLayout } from './layout.js';
import { priorityMark, priorityShort } from './priority.js';
import { clockLabel, isSameLocalDay, monthDay } from './when.js';

export interface TaskReminderInput {
  readonly locale?: string | null | undefined;
  readonly id: string;
  readonly title: string;
  readonly content?: string | null | undefined;
  readonly dueDate?: string | null | undefined;
  readonly startDate?: string | null | undefined;
  readonly isAllDay?: boolean | undefined;
  readonly timeZone?: string | null | undefined;
  readonly priority?: Priority | null | undefined;
  readonly listName?: string | null | undefined;
  readonly tags?: readonly { readonly name: string }[] | undefined;
  readonly now: string;
  readonly origin?: string | undefined;
}

export function renderTaskReminder(input: TaskReminderInput): RenderedMail {
  const locale = mailLocale(input.locale);
  const origin = mailOrigin(input.origin);
  const zone = input.timeZone?.trim() ? input.timeZone : 'Europe/Madrid';
  const tags = (input.tags ?? [])
    .map((tag) => ({ name: tag.name.trim() }))
    .filter((tag) => tag.name.length > 0);
  const title = displayTitle(titleForEmail(input.title, tags), locale);
  const priority = input.priority ?? 'none';
  const listName = input.listName?.trim() ? input.listName.trim() : null;
  const when = whenLabel(input, zone, locale);
  const note = plainNote(input.content, title);
  const subjectTime = subjectClock(input, zone);
  const subject =
    locale === 'en' ? `Reminder: ${title}${subjectTime}` : `Recordatorio: ${title}${subjectTime}`;
  const url = `${origin}/task/${input.id}`;
  const preheader = [when, listName, note]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(' · ');
  const bodyText = reminderText({ locale, title, when, listName, priority, tags, note, url });
  const bodyHtml = reminderHtml({ locale, title, when, listName, priority, tags, note, url });
  const reason =
    locale === 'en'
      ? 'You receive this email because you set a reminder on this task.'
      : 'Recibes este correo porque pusiste un recordatorio a esta tarea.';
  const laid = renderEmailLayout({
    locale,
    documentTitle: subject,
    preheader: preheader.length > 0 ? preheader : subject,
    bodyHtml,
    bodyText,
    reason,
    origin,
  });
  return { subject, text: laid.text, html: laid.html };
}

function subjectClock(input: TaskReminderInput, zone: string): string {
  if (input.dueDate == null || input.isAllDay === true) {
    return '';
  }
  const clock = clockLabel(input.dueDate, zone);
  return clock === null ? '' : ` (${clock})`;
}

function whenLabel(input: TaskReminderInput, zone: string, locale: MailLocale): string | null {
  if (input.dueDate == null) {
    return null;
  }
  const day = monthDay(input.dueDate, zone, locale);
  if (day === null) {
    return null;
  }
  const today = isSameLocalDay(input.dueDate, input.now, zone);
  const prefix = today ? (locale === 'en' ? `Today, ${day}` : `Hoy, ${day}`) : day;
  if (input.isAllDay === true) {
    const allDay = locale === 'en' ? 'All day' : 'Todo el día';
    return `${prefix} · ${allDay}`;
  }
  const clock = clockLabel(input.dueDate, zone);
  return clock === null ? prefix : `${prefix} · ${clock}`;
}

function reminderText(input: {
  locale: MailLocale;
  title: string;
  when: string | null;
  listName: string | null;
  priority: Priority;
  tags: readonly { name: string }[];
  note: string | null;
  url: string;
}): string {
  const lines = [input.locale === 'en' ? 'Reminder' : 'Recordatorio', input.title];
  if (input.when !== null) {
    lines.push(`${input.locale === 'en' ? 'When' : 'Cuándo'}: ${input.when}`);
  }
  if (input.listName !== null) {
    lines.push(`${input.locale === 'en' ? 'List' : 'Lista'}: ${input.listName}`);
  }
  const priority = priorityShort(input.priority, input.locale);
  if (priority !== null) {
    lines.push(`${input.locale === 'en' ? 'Priority' : 'Prioridad'}: ${priority}`);
  }
  if (input.tags.length > 0) {
    lines.push(
      `${input.locale === 'en' ? 'Tags' : 'Etiquetas'}: ${input.tags.map((tag) => tag.name).join(', ')}`,
    );
  }
  if (input.note !== null) {
    lines.push('', `${input.locale === 'en' ? 'Note' : 'Nota'}: ${input.note}`);
  }
  lines.push('', `${input.locale === 'en' ? 'View task' : 'Ver tarea'}: ${input.url}`);
  return lines.join('\n');
}

function reminderHtml(input: {
  locale: MailLocale;
  title: string;
  when: string | null;
  listName: string | null;
  priority: Priority;
  tags: readonly { name: string }[];
  note: string | null;
  url: string;
}): string {
  const eyebrow = input.locale === 'en' ? 'Reminder' : 'Recordatorio';
  const rows: string[] = [];
  if (input.when !== null) {
    rows.push(
      detailRow(
        input.locale === 'en' ? 'When' : 'Cuándo',
        `<strong>${escapeHtml(input.when)}</strong>`,
        rows.length === 0,
      ),
    );
  }
  if (input.listName !== null) {
    rows.push(
      detailRow(
        input.locale === 'en' ? 'List' : 'Lista',
        escapeHtml(input.listName),
        rows.length === 0,
      ),
    );
  }
  const mark = priorityMark(input.priority, input.locale);
  const short = priorityShort(input.priority, input.locale);
  if (mark !== null && short !== null) {
    rows.push(
      detailRow(
        input.locale === 'en' ? 'Priority' : 'Prioridad',
        `<span style="color:${mark.color};font-size:12px;">${mark.mark}</span><span class="ink" style="color:#191919;"> ${escapeHtml(short)}</span>`,
        rows.length === 0,
      ),
    );
  }
  if (input.tags.length > 0) {
    rows.push(
      detailRow(
        input.locale === 'en' ? 'Tags' : 'Etiquetas',
        chipLine(input.tags),
        rows.length === 0,
      ),
    );
  }
  const table =
    rows.length === 0
      ? ''
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join('')}</table>`;
  const note =
    input.note === null
      ? ''
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><tr><td class="note" bgcolor="#f7f8fb" style="background-color:#f7f8fb;border:1px solid #e6e9f2;border-radius:10px;padding:12px 14px;font-size:14px;line-height:21px;"><span class="ink2" style="color:#6b6b6b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">${input.locale === 'en' ? 'Note' : 'Nota'}</span><br><span class="ink" style="color:#191919;">${escapeHtml(input.note)}</span></td></tr></table>`;
  const button = emailButton(input.url, input.locale === 'en' ? 'View task' : 'Ver tarea');
  return `<p class="accink" style="margin:0 0 4px 0;font-size:13px;line-height:18px;color:#3e60cd;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">${eyebrow}</p>
<h1 class="h1" style="margin:0 0 16px 0;font-size:24px;line-height:30px;font-weight:700;"><a href="${escapeHtml(input.url)}" class="ink" style="color:#191919;text-decoration:none;">${escapeHtml(input.title)}</a></h1>
${table}
${note}
${button}`;
}

function detailRow(label: string, valueHtml: string, first: boolean): string {
  const border = first ? '' : 'border-top:1px solid #e6e9f2;';
  return `<tr><td class="ink2 border" width="96" valign="top" style="width:96px;${border}padding:10px 8px 10px 0;font-family:${MAIL_FONT};font-size:13px;line-height:20px;color:#6b6b6b;">${escapeHtml(label)}</td><td class="ink border" valign="top" style="${border}padding:10px 0;font-family:${MAIL_FONT};font-size:15px;line-height:20px;color:#191919;">${valueHtml}</td></tr>`;
}

function chipLine(tags: readonly { name: string }[]): string {
  return tags
    .map(
      (tag) =>
        `<span class="chip" style="display:inline-block;background-color:#ecf0fe;color:#3e60cd;font-size:12px;line-height:18px;font-weight:600;padding:1px 8px;border-radius:9px;margin:4px 4px 0 0;">${escapeHtml(tag.name)}</span>`,
    )
    .join('');
}
