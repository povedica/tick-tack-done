import {
  buildDailyDigest,
  formatDailyDigest,
  type DigestItem,
  type DigestTask,
} from '@reflexionia/domain';
import { emailButton, escapeHtml, MAIL_FONT, type MailLocale, type RenderedMail } from './html.js';
import { mailOrigin, renderEmailLayout } from './layout.js';
import { priorityBarColor, priorityMark } from './priority.js';
import {
  clockLabel,
  isLocalYesterday,
  isSameLocalDay,
  longDate,
  reminderClock,
  shortWeekday,
} from './when.js';

export interface DailyDigestMailInput {
  readonly locale: MailLocale;
  readonly fireAt: string;
  readonly timeZone: string;
  readonly tasks: readonly DigestTask[];
  readonly loadLine?: string | null | undefined;
  readonly reminderTime?: string | null | undefined;
  readonly origin?: string | undefined;
}

export interface DailyDigestRender {
  readonly mail: RenderedMail;
  /** Plain list shared with push and Telegram. HTML stays on the email. */
  readonly pushTitle: string;
  readonly pushBody: string;
}

export function renderDailyDigest(input: DailyDigestMailInput): DailyDigestRender {
  const origin = mailOrigin(input.origin);
  const model = buildDailyDigest({
    tasks: input.tasks,
    now: input.fireAt,
    fireAt: input.fireAt,
  });
  const shown = [...model.overdue, ...model.today];
  const pushCore = formatDailyDigest({
    now: input.fireAt,
    fireAt: input.fireAt,
    tasks: shown.map((item) => ({
      title: item.sourceTitle,
      dueDate: item.dueDate,
      startDate: item.startDate,
      isAllDay: item.isAllDay,
      timeZone: item.timeZone,
    })),
  });
  const loadLine = input.loadLine?.trim() ? input.loadLine.trim() : null;
  const pushBody = loadLine === null ? pushCore : `${pushCore}\n\n${loadLine}`;
  const heading = input.locale === 'en' ? 'Plan your day' : 'Planifica tu día';
  const subject = digestSubject(input.locale, model.todayCount, model.overdueCount);
  const dateLabel = longDate(input.fireAt, input.timeZone, input.locale) ?? '';
  const preheader = digestPreheader(
    input.locale,
    model.overdue,
    model.today,
    input.fireAt,
    model.overdueCount + model.todayCount,
  );
  const todayUrl = `${origin}/today`;
  const bodyText = digestText({
    locale: input.locale,
    dateLabel,
    heading,
    todayCount: model.todayCount,
    overdueCount: model.overdueCount,
    loadLine,
    overdue: model.overdue,
    today: model.today,
    omitted: model.omitted,
    fireAt: input.fireAt,
    todayUrl,
  });
  const bodyHtml = digestHtml({
    locale: input.locale,
    dateLabel,
    heading,
    todayCount: model.todayCount,
    overdueCount: model.overdueCount,
    loadLine,
    overdue: model.overdue,
    today: model.today,
    omitted: model.omitted,
    fireAt: input.fireAt,
    origin,
    todayUrl,
  });
  const reason = digestReason(input.locale, input.reminderTime);
  const laid = renderEmailLayout({
    locale: input.locale,
    documentTitle: subject,
    preheader,
    bodyHtml,
    bodyText,
    reason,
    origin,
  });
  return {
    mail: { subject, text: laid.text, html: laid.html },
    pushTitle: 'Planifica tu día',
    pushBody,
  };
}

export function digestSubject(locale: MailLocale, today: number, overdue: number): string {
  if (today + overdue === 0) {
    return locale === 'en' ? 'Plan your day' : 'Planifica tu día';
  }
  if (locale === 'en') {
    return `Plan your day: ${String(today)} today, ${String(overdue)} overdue`;
  }
  const late = overdue === 1 ? '1 vencida' : `${String(overdue)} vencidas`;
  return `Planifica tu día: ${String(today)} para hoy, ${late}`;
}

function digestPreheader(
  locale: MailLocale,
  overdue: readonly DigestItem[],
  today: readonly DigestItem[],
  fireAt: string,
  total: number,
): string {
  if (total === 0) {
    return locale === 'en'
      ? 'You have no tasks due today.'
      : 'No tienes tareas con fecha para hoy.';
  }
  const first = overdue[0] ?? today[0];
  if (first === undefined) {
    return locale === 'en'
      ? 'You have no tasks due today.'
      : 'No tienes tareas con fecha para hoy.';
  }
  if (overdue.length > 0) {
    const when = overduePhrase(first, fireAt, locale);
    return locale === 'en'
      ? `First up: ${first.title} (${when}). Open Today to plan your day.`
      : `Primero: ${first.title} (${when}). Abre Hoy para ordenar tu día.`;
  }
  const when = todayWhen(first, locale);
  return locale === 'en'
    ? `First up: ${first.title} (${when}). Open Today to plan your day.`
    : `Primero: ${first.title} (${when}). Abre Hoy para ordenar tu día.`;
}

function digestReason(locale: MailLocale, reminderTime: string | null | undefined): string {
  const time = reminderClock(reminderTime);
  if (locale === 'en') {
    return time === null
      ? 'You receive this email because the daily summary is turned on.'
      : `You receive this email because the daily summary is turned on at ${time}.`;
  }
  return time === null
    ? 'Recibes este correo porque tienes activado el resumen diario.'
    : `Recibes este correo porque tienes activado el resumen diario a las ${time}.`;
}

function digestText(input: {
  locale: MailLocale;
  dateLabel: string;
  heading: string;
  todayCount: number;
  overdueCount: number;
  loadLine: string | null;
  overdue: readonly DigestItem[];
  today: readonly DigestItem[];
  omitted: number;
  fireAt: string;
  todayUrl: string;
}): string {
  const lines: string[] = [];
  if (input.dateLabel.length > 0) {
    lines.push(input.dateLabel, input.heading);
  } else {
    lines.push(input.heading);
  }
  if (input.todayCount + input.overdueCount === 0) {
    lines.push('', emptyCopy(input.locale));
  } else {
    lines.push('', summaryText(input.locale, input.todayCount, input.overdueCount));
    if (input.loadLine !== null) {
      lines.push(input.loadLine);
    }
    if (input.overdue.length > 0) {
      lines.push('', sectionText('overdue', input.locale, input.overdueCount));
      for (const item of input.overdue) {
        lines.push(
          `- ${overdueWhen(item, input.fireAt, input.locale)} · ${itemLine(item, input.locale)}`,
        );
      }
    }
    if (input.today.length > 0) {
      lines.push('', sectionText('today', input.locale, input.todayCount));
      for (const item of input.today) {
        lines.push(`- ${todayWhen(item, input.locale)} · ${itemLine(item, input.locale)}`);
      }
    }
    if (input.omitted > 0) {
      lines.push('', `${moreLabel(input.locale, input.omitted)}: ${input.todayUrl}`);
    }
  }
  const open = input.locale === 'en' ? 'Open Today' : 'Abrir Hoy';
  lines.push('', `${open}: ${input.todayUrl}`);
  return lines.join('\n');
}

function digestHtml(input: {
  locale: MailLocale;
  dateLabel: string;
  heading: string;
  todayCount: number;
  overdueCount: number;
  loadLine: string | null;
  overdue: readonly DigestItem[];
  today: readonly DigestItem[];
  omitted: number;
  fireAt: string;
  origin: string;
  todayUrl: string;
}): string {
  const parts: string[] = [];
  if (input.dateLabel.length > 0) {
    parts.push(
      `<p class="accink" style="margin:0 0 4px 0;font-size:13px;line-height:18px;color:#3e60cd;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">${escapeHtml(input.dateLabel)}</p>`,
    );
  }
  parts.push(
    `<h1 class="ink h1" style="margin:0 0 8px 0;font-size:26px;line-height:32px;font-weight:700;color:#191919;">${escapeHtml(input.heading)}</h1>`,
  );
  if (input.todayCount + input.overdueCount === 0) {
    parts.push(
      `<p class="ink" style="margin:0;font-size:15px;line-height:22px;color:#191919;">${escapeHtml(emptyCopy(input.locale))}</p>`,
    );
  } else {
    parts.push(
      `<p class="ink2" style="margin:0;font-size:15px;line-height:22px;color:#6b6b6b;">${summaryHtml(input.locale, input.todayCount, input.overdueCount)}</p>`,
    );
    if (input.loadLine !== null) {
      parts.push(
        `<p class="ink2" style="margin:6px 0 0 0;font-size:13px;line-height:19px;color:#6b6b6b;">${escapeHtml(input.loadLine)}</p>`,
      );
    }
    if (input.overdue.length > 0) {
      parts.push(
        sectionTable({
          kind: 'overdue',
          locale: input.locale,
          count: input.overdueCount,
          items: input.overdue,
          fireAt: input.fireAt,
          origin: input.origin,
          omitted: input.today.length === 0 ? input.omitted : 0,
          todayUrl: input.todayUrl,
        }),
      );
    }
    if (input.today.length > 0) {
      parts.push(
        sectionTable({
          kind: 'today',
          locale: input.locale,
          count: input.todayCount,
          items: input.today,
          fireAt: input.fireAt,
          origin: input.origin,
          omitted: input.omitted,
          todayUrl: input.todayUrl,
        }),
      );
    }
  }
  const label = input.locale === 'en' ? 'Open Today' : 'Abrir Hoy';
  parts.push(emailButton(input.todayUrl, label));
  return parts.join('\n');
}

function sectionTable(input: {
  kind: 'overdue' | 'today';
  locale: MailLocale;
  count: number;
  items: readonly DigestItem[];
  fireAt: string;
  origin: string;
  omitted: number;
  todayUrl: string;
}): string {
  const title =
    input.kind === 'overdue'
      ? input.locale === 'en'
        ? 'Overdue'
        : 'Vencidas'
      : input.locale === 'en'
        ? 'Today'
        : 'Hoy';
  const titleClass = input.kind === 'overdue' ? 'danger' : 'accink';
  const titleColor = input.kind === 'overdue' ? '#c92a2a' : '#3e60cd';
  const rows = input.items
    .map((item, index) =>
      taskRow(item, index === 0, input.kind, input.fireAt, input.locale, input.origin),
    )
    .join('\n');
  const more =
    input.omitted > 0
      ? `<tr><td class="border" colspan="2" style="border-top:1px solid #e6e9f2;padding:12px 0 0 0;font-family:${MAIL_FONT};font-size:14px;line-height:20px;"><a href="${escapeHtml(input.todayUrl)}" class="accink" style="color:#3e60cd;font-weight:600;text-decoration:none;">${escapeHtml(moreLabel(input.locale, input.omitted))} &rarr;</a></td></tr>`
      : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
<tr><td colspan="2" style="padding-bottom:6px;font-family:${MAIL_FONT};"><span class="${titleClass}" style="font-size:13px;line-height:18px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:${titleColor};">${title}</span><span class="ink2" style="font-size:13px;color:#6b6b6b;">&nbsp;${String(input.count)}</span></td></tr>
${rows}
${more}
</table>`;
}

function taskRow(
  item: DigestItem,
  first: boolean,
  kind: 'overdue' | 'today',
  fireAt: string,
  locale: MailLocale,
  origin: string,
): string {
  const when = kind === 'overdue' ? overdueWhen(item, fireAt, locale) : todayWhen(item, locale);
  const whenClass = kind === 'overdue' ? 'danger' : item.isAllDay ? 'accink' : 'ink2';
  const whenColor = kind === 'overdue' ? '#c92a2a' : item.isAllDay ? '#3e60cd' : '#6b6b6b';
  const border = first ? '' : 'border-top:1px solid #e6e9f2;';
  const bar = priorityBarColor(item.priority);
  const barClass = item.priority === 'none' ? ' class="bar-none"' : '';
  return `<tr>
<td class="time border ${whenClass}" valign="top" width="84" style="width:84px;${border}padding:12px 8px 12px 0;font-size:13px;line-height:20px;color:${whenColor};font-weight:600;white-space:nowrap;">${escapeHtml(when)}</td>
<td class="border" valign="top" style="${border}padding:12px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="3"${barClass} bgcolor="${bar}" style="width:3px;background-color:${bar};border-radius:2px;font-size:0;line-height:0;">&nbsp;</td>
<td style="padding-left:10px;font-family:${MAIL_FONT};">${taskTitle(item, origin)}${metaLine(item, locale)}${chipLine(item.tags)}</td>
</tr></table>
</td>
</tr>`;
}

function taskTitle(item: DigestItem, origin: string): string {
  const label = escapeHtml(item.title);
  if (item.id === null || item.id.length === 0) {
    return `<span class="ink" style="color:#191919;font-size:15px;line-height:21px;font-weight:600;">${label}</span>`;
  }
  const href = escapeHtml(`${origin}/task/${item.id}`);
  return `<a href="${href}" class="ink task-link" style="color:#191919;font-size:15px;line-height:21px;font-weight:600;text-decoration:none;">${label}</a>`;
}

function metaLine(item: DigestItem, locale: MailLocale): string {
  const mark = priorityMark(item.priority, locale);
  const bits: string[] = [];
  if (mark !== null) {
    bits.push(
      `<span style="color:${mark.color};font-size:11px;">${mark.mark}</span><span class="ink2" style="color:#6b6b6b;"> ${escapeHtml(mark.label)}</span>`,
    );
  }
  if (item.listName !== null) {
    if (bits.length > 0) {
      bits.push('<span class="ink2" style="color:#6b6b6b;">&nbsp;·&nbsp;</span>');
    }
    bits.push(`<span class="ink2" style="color:#6b6b6b;">${escapeHtml(item.listName)}</span>`);
  }
  if (bits.length === 0) {
    return '';
  }
  return `<div style="font-size:13px;line-height:19px;margin-top:2px;">${bits.join('')}</div>`;
}

function chipLine(tags: DigestItem['tags']): string {
  if (tags.length === 0) {
    return '';
  }
  const chips = tags
    .map(
      (tag) =>
        `<span class="chip" style="display:inline-block;background-color:#ecf0fe;color:#3e60cd;font-size:12px;line-height:18px;font-weight:600;padding:1px 8px;border-radius:9px;margin:4px 4px 0 0;">${escapeHtml(tag.name)}</span>`,
    )
    .join('');
  return `<div style="line-height:18px;">${chips}</div>`;
}

function itemLine(item: DigestItem, locale: MailLocale): string {
  const bits = [item.title];
  const mark = priorityMark(item.priority, locale);
  if (mark !== null) {
    bits.push(mark.label);
  }
  if (item.listName !== null) {
    bits.push(item.listName);
  }
  if (item.tags.length > 0) {
    bits.push(item.tags.map((tag) => tag.name).join(', '));
  }
  return bits.join(' · ');
}

function overdueWhen(item: DigestItem, fireAt: string, locale: MailLocale): string {
  if (isSameLocalDay(item.dueDate, fireAt, item.timeZone)) {
    return clockLabel(item.dueDate, item.timeZone) ?? (locale === 'en' ? 'Today' : 'Hoy');
  }
  if (isLocalYesterday(item.dueDate, fireAt, item.timeZone)) {
    return locale === 'en' ? 'Yesterday' : 'Ayer';
  }
  return shortWeekday(item.dueDate, item.timeZone, locale) ?? '';
}

function overduePhrase(item: DigestItem, fireAt: string, locale: MailLocale): string {
  const when = overdueWhen(item, fireAt, locale);
  if (locale === 'en') {
    if (when === 'Yesterday') {
      return 'overdue since yesterday';
    }
    if (isSameLocalDay(item.dueDate, fireAt, item.timeZone)) {
      return `overdue today at ${when}`;
    }
    return `overdue since ${when}`;
  }
  if (when === 'Ayer') {
    return 'vencida ayer';
  }
  if (isSameLocalDay(item.dueDate, fireAt, item.timeZone)) {
    return `vencida hoy a las ${when}`;
  }
  return `vencida el ${when}`;
}

function todayWhen(item: DigestItem, locale: MailLocale): string {
  if (item.isAllDay) {
    return locale === 'en' ? 'All day' : 'Todo el día';
  }
  const due = clockLabel(item.dueDate, item.timeZone);
  const start = item.startDate === null ? null : clockLabel(item.startDate, item.timeZone);
  if (
    start !== null &&
    due !== null &&
    start !== due &&
    item.startDate !== null &&
    isSameLocalDay(item.startDate, item.dueDate, item.timeZone)
  ) {
    return `${start} – ${due}`;
  }
  return due ?? (locale === 'en' ? 'Today' : 'Hoy');
}

function summaryText(locale: MailLocale, today: number, overdue: number): string {
  if (locale === 'en') {
    const tasks = today === 1 ? '1 task for today' : `${String(today)} tasks for today`;
    const late = overdue === 1 ? '1 overdue' : `${String(overdue)} overdue`;
    return `You have ${tasks} and ${late}.`;
  }
  const tasks = today === 1 ? '1 tarea para hoy' : `${String(today)} tareas para hoy`;
  const late = overdue === 1 ? '1 vencida' : `${String(overdue)} vencidas`;
  return `Tienes ${tasks} y ${late}.`;
}

function summaryHtml(locale: MailLocale, today: number, overdue: number): string {
  if (locale === 'en') {
    const tasks = today === 1 ? '1 task for today' : `${String(today)} tasks for today`;
    const late = overdue === 1 ? '1 overdue' : `${String(overdue)} overdue`;
    return `You have <strong class="ink" style="color:#191919;">${escapeHtml(tasks)}</strong> and <strong class="danger" style="color:#c92a2a;">${escapeHtml(late)}</strong>.`;
  }
  const tasks = today === 1 ? '1 tarea para hoy' : `${String(today)} tareas para hoy`;
  const late = overdue === 1 ? '1 vencida' : `${String(overdue)} vencidas`;
  return `Tienes <strong class="ink" style="color:#191919;">${escapeHtml(tasks)}</strong> y <strong class="danger" style="color:#c92a2a;">${escapeHtml(late)}</strong>.`;
}

function sectionText(kind: 'overdue' | 'today', locale: MailLocale, count: number): string {
  if (kind === 'overdue') {
    return locale === 'en' ? `Overdue (${String(count)})` : `Vencidas (${String(count)})`;
  }
  return locale === 'en' ? `Today (${String(count)})` : `Hoy (${String(count)})`;
}

function moreLabel(locale: MailLocale, omitted: number): string {
  if (locale === 'en') {
    return omitted === 1 ? 'and 1 more in Today' : `and ${String(omitted)} more in Today`;
  }
  return `y ${String(omitted)} más en Hoy`;
}

function emptyCopy(locale: MailLocale): string {
  return locale === 'en' ? 'You have no tasks due today.' : 'No hay tareas con fecha para hoy.';
}
