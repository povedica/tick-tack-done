import { emailButton, escapeHtml, type MailLocale, type RenderedMail } from './html.js';
import { mailOrigin, renderEmailLayout } from './layout.js';

export function renderShutdownDigest(input: {
  readonly locale: MailLocale;
  readonly pending: number;
  readonly origin?: string | undefined;
}): RenderedMail {
  const origin = mailOrigin(input.origin);
  const url = `${origin}/cierre`;
  const english = input.locale === 'en';
  const subject = english ? 'Close your day' : 'Cierra tu día';
  const heading = subject;
  const pending =
    input.pending === 1
      ? english
        ? '1 task from today is still open.'
        : 'Queda 1 tarea de hoy.'
      : english
        ? `${String(input.pending)} tasks from today are still open.`
        : `Quedan ${String(input.pending)} tareas de hoy.`;
  const button = english ? 'Open day shutdown' : 'Abrir el cierre';
  const eyebrow = english ? 'Day shutdown' : 'Cierre de día';
  const bodyText = [eyebrow, heading, '', pending, '', `${button}: ${url}`].join('\n');
  const bodyHtml = `<p class="accink" style="margin:0 0 4px 0;font-size:13px;line-height:18px;color:#3e60cd;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">${eyebrow}</p>
<h1 class="ink h1" style="margin:0 0 12px 0;font-size:24px;line-height:30px;font-weight:700;color:#191919;">${escapeHtml(heading)}</h1>
<p class="ink" style="margin:0;font-size:15px;line-height:22px;color:#191919;">${escapeHtml(pending)}</p>
${emailButton(url, button)}`;
  const reason = english
    ? 'You receive this email because the day-shutdown reminder is turned on.'
    : 'Recibes este correo porque tienes activado el aviso de cierre del día.';
  const laid = renderEmailLayout({
    locale: input.locale,
    documentTitle: subject,
    preheader: pending,
    bodyHtml,
    bodyText,
    reason,
    origin,
  });
  return { subject, text: laid.text, html: laid.html };
}
