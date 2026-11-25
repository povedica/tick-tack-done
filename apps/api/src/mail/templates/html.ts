export type MailLocale = 'es' | 'en';

export interface RenderedMail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export const MAIL_FONT = "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function mailLocale(value: string | null | undefined): MailLocale {
  return value?.toLowerCase().startsWith('en') === true ? 'en' : 'es';
}

/** Blank titles become a readable fallback so subjects and links keep their text. */
export function displayTitle(title: string, locale: MailLocale): string {
  const trimmed = title.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return locale === 'en' ? 'Untitled' : 'Sin título';
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Outlook desktop needs a fixed-width VML roundrect. Other clients use the anchor. */
export function emailButton(url: string, label: string): string {
  const href = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  const width = Math.min(360, Math.max(160, 48 + label.length * 9));
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn-wrap" style="margin-top:24px;"><tr>',
    `<td class="btn" align="center" bgcolor="#3e60cd" style="background-color:#3e60cd;border-radius:10px;">`,
    `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" href="${href}" style="height:44px;v-text-anchor:middle;width:${String(width)}px;" arcsize="20%" fillcolor="#3e60cd" stroke="f"><center style="color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:15px;font-weight:bold;">${safeLabel}</center></v:roundrect><![endif]-->`,
    `<!--[if !mso]><!-- --><a href="${href}" style="display:inline-block;padding:12px 24px;font-family:${MAIL_FONT};font-size:15px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${safeLabel}</a><!--<![endif]-->`,
    '</td></tr></table>',
  ].join('');
}

export function rawLink(url: string): string {
  const href = escapeHtml(url);
  return `<p style="margin:12px 0 0 0;font-size:13px;line-height:20px;"><a href="${href}" class="accink" style="color:#3e60cd;text-decoration:underline;word-break:break-all;">${href}</a></p>`;
}

export function textParagraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(
      (part) =>
        `<p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">${escapeHtml(part).replaceAll('\n', '<br>')}</p>`,
    )
    .join('');
}

export function plainNote(content: string | null | undefined, title: string): string | null {
  if (content == null) {
    return null;
  }
  const flat = content.replace(/\s+/g, ' ').trim();
  if (flat.length === 0 || flat === title.trim()) {
    return null;
  }
  return flat.length > 280 ? `${flat.slice(0, 279).trimEnd()}…` : flat;
}
