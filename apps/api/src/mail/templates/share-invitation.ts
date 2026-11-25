import { emailButton, escapeHtml, rawLink, type RenderedMail } from './html.js';
import { renderEmailLayout } from './layout.js';

export interface ShareInvitationCopy {
  readonly locale: 'es' | 'en';
  readonly displayName: string;
  readonly listName: string;
  readonly ownerName: string;
  readonly url: string;
  readonly origin?: string | undefined;
}

/** RF-1801. The mail names the list and the owner, and nothing else. */
export function renderShareInvitation(copy: ShareInvitationCopy): RenderedMail {
  const name = copy.displayName.trim().length > 0 ? copy.displayName.trim() : '—';
  if (copy.locale === 'en') {
    const text = [
      `Hi ${name},`,
      '',
      `${copy.ownerName} invited you to the list “${copy.listName}” on tick-tack-done.`,
      '',
      'Nothing is shared until you accept:',
      copy.url,
    ].join('\n');
    const subject = `Invitation to “${copy.listName}”`;
    const html = `<p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">Hi ${escapeHtml(name)},</p><p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">${escapeHtml(copy.ownerName)} invited you to the list “${escapeHtml(copy.listName)}”.</p><p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">Nothing is shared until you accept.</p>${emailButton(copy.url, 'Review the invitation')}${rawLink(copy.url)}`;
    return finish(
      copy.locale,
      subject,
      text,
      html,
      'You receive this email because you were invited to a shared list.',
      copy.origin,
    );
  }
  const text = [
    `Hola, ${name}:`,
    '',
    `${copy.ownerName} te ha invitado a la lista «${copy.listName}» en tick-tack-done.`,
    '',
    'No verás la lista hasta que aceptes:',
    copy.url,
  ].join('\n');
  const subject = `Invitación a «${copy.listName}»`;
  const html = `<p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">Hola, ${escapeHtml(name)}:</p><p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">${escapeHtml(copy.ownerName)} te ha invitado a la lista «${escapeHtml(copy.listName)}».</p><p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">No verás la lista hasta que aceptes.</p>${emailButton(copy.url, 'Revisar la invitación')}${rawLink(copy.url)}`;
  return finish(
    copy.locale,
    subject,
    text,
    html,
    'Recibes este correo porque te han invitado a una lista compartida.',
    copy.origin,
  );
}

function finish(
  locale: 'es' | 'en',
  subject: string,
  text: string,
  html: string,
  reason: string,
  origin: string | undefined,
): RenderedMail {
  const laid = renderEmailLayout({
    locale,
    documentTitle: subject,
    preheader: text.replace(/\s+/g, ' ').trim().slice(0, 140),
    bodyHtml: html,
    bodyText: text,
    reason,
    ...(origin === undefined ? {} : { origin }),
  });
  return { subject, text: laid.text, html: laid.html };
}
