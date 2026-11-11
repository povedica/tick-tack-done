import { escapeHtml, type RenderedMail } from './password-reset.js';

export interface ShareInvitationCopy {
  readonly locale: 'es' | 'en';
  readonly displayName: string;
  readonly listName: string;
  readonly ownerName: string;
  readonly url: string;
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
      '',
      '— tick-tack-done',
    ].join('\n');
    return {
      subject: `Invitation to “${copy.listName}”`,
      text,
      html: `<p>Hi ${escapeHtml(name)},</p><p>${escapeHtml(copy.ownerName)} invited you to the list “${escapeHtml(copy.listName)}”.</p><p><a href="${escapeHtml(copy.url)}">Review the invitation</a></p>`,
    };
  }
  const text = [
    `Hola, ${name}:`,
    '',
    `${copy.ownerName} te ha invitado a la lista «${copy.listName}» en tick-tack-done.`,
    '',
    'No verás la lista hasta que aceptes:',
    copy.url,
    '',
    '— tick-tack-done',
  ].join('\n');
  return {
    subject: `Invitación a «${copy.listName}»`,
    text,
    html: `<p>Hola, ${escapeHtml(name)}:</p><p>${escapeHtml(copy.ownerName)} te ha invitado a la lista «${escapeHtml(copy.listName)}».</p><p><a href="${escapeHtml(copy.url)}">Revisar la invitación</a></p>`,
  };
}
