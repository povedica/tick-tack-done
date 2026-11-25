import { emailButton, escapeHtml, mailLocale, type MailLocale, type RenderedMail } from './html.js';
import { mailOrigin, renderEmailLayout } from './layout.js';

export function renderCountdownReminder(input: {
  readonly locale?: string | null | undefined;
  readonly title: string;
  readonly kind: 'today' | 'upcoming';
  readonly days: number;
  readonly origin?: string | undefined;
}): RenderedMail {
  const locale: MailLocale = mailLocale(input.locale);
  const origin = mailOrigin(input.origin);
  const url = `${origin}/countdowns`;
  const english = locale === 'en';
  const detail =
    input.kind === 'today'
      ? english
        ? "It's today."
        : 'Es hoy.'
      : input.days === 1
        ? english
          ? '1 day left.'
          : 'Queda 1 día.'
        : english
          ? `${String(input.days)} days left.`
          : `Quedan ${String(input.days)} días.`;
  const subject =
    input.kind === 'today'
      ? english
        ? `${input.title}: it's today`
        : `${input.title}: es hoy`
      : english
        ? input.days === 1
          ? `${input.title}: 1 day left`
          : `${input.title}: ${String(input.days)} days left`
        : input.days === 1
          ? `${input.title}: queda 1 día`
          : `${input.title}: quedan ${String(input.days)} días`;
  const eyebrow = english ? 'Countdown' : 'Cuenta atrás';
  const button = english ? 'View countdown' : 'Ver cuenta atrás';
  const bodyText = [eyebrow, input.title, '', detail, '', `${button}: ${url}`].join('\n');
  const bodyHtml = `<p class="accink" style="margin:0 0 4px 0;font-size:13px;line-height:18px;color:#3e60cd;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">${eyebrow}</p>
<h1 class="ink h1" style="margin:0 0 12px 0;font-size:24px;line-height:30px;font-weight:700;color:#191919;">${escapeHtml(input.title)}</h1>
<p class="ink" style="margin:0;font-size:15px;line-height:22px;color:#191919;">${escapeHtml(detail)}</p>
${emailButton(url, button)}`;
  const reason = english
    ? 'You receive this email because a reminder for this countdown is turned on.'
    : 'Recibes este correo porque activaste un aviso de esta cuenta atrás.';
  const laid = renderEmailLayout({
    locale,
    documentTitle: subject,
    preheader: `${input.title}. ${detail}`,
    bodyHtml,
    bodyText,
    reason,
    origin,
  });
  return { subject, text: laid.text, html: laid.html };
}
