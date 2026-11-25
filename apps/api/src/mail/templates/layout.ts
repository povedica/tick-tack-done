import { publicOrigin } from '../../auth/public-origin.js';
import {
  escapeHtml,
  MAIL_FONT,
  textParagraphs,
  type MailLocale,
  type RenderedMail,
} from './html.js';

export interface EmailLayoutInput {
  readonly locale: MailLocale;
  readonly documentTitle: string;
  readonly preheader: string;
  readonly bodyHtml: string;
  readonly bodyText: string;
  readonly reason: string;
  readonly origin?: string | undefined;
}

const PREHEADER_PAD = '&#8199;&#847;'.repeat(8);

const DARK_CSS = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  a { text-decoration:none; }
  .task-link:hover { text-decoration:underline !important; }
  @media (max-width:620px) {
    .container { width:100% !important; }
    .px { padding-left:16px !important; padding-right:16px !important; }
    .outer { padding:12px 8px !important; }
    .h1 { font-size:22px !important; }
    .time { width:64px !important; white-space:normal !important; }
    .btn a { display:block !important; }
    .btn-wrap { width:100% !important; }
  }
  @media (prefers-color-scheme: dark) {
    .bg { background-color:#242424 !important; }
    .surface { background-color:#222222 !important; border-color:#333333 !important; }
    .ink { color:#ffffff !important; }
    .ink2 { color:#a8a8a8 !important; }
    .accink { color:#c5d4ff !important; }
    .danger { color:#ff8787 !important; }
    .border { border-color:#333333 !important; }
    .chip { background-color:#2f3a5c !important; color:#c5d4ff !important; }
    .note { background-color:#2a2a2a !important; border-color:#3a3a3a !important; }
    .bar-none { background-color:#4a4a4a !important; }
    .placeholder { border-color:#4a4a4a !important; color:#a8a8a8 !important; }
  }
  [data-ogsc] .ink { color:#ffffff !important; }
  [data-ogsc] .ink2 { color:#a8a8a8 !important; }
  [data-ogsc] .accink { color:#c5d4ff !important; }
`;

/** Shared frame. The layout does not know which notice it is wrapping. */
export function renderEmailLayout(input: EmailLayoutInput): { html: string; text: string } {
  const origin = mailOrigin(input.origin);
  const host = originHost(origin);
  const notifications = `${origin}/settings/notifications`;
  const home = `${origin}/`;
  const manage = input.locale === 'en' ? 'Manage notifications' : 'Gestionar notificaciones';
  const open = input.locale === 'en' ? 'Open TickTackDone' : 'Abrir TickTackDone';
  const icon = `${origin}/apple-touch-icon.png`;
  const html = `<!DOCTYPE html>
<html lang="${input.locale}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(input.documentTitle)}</title>
<!--[if mso]><style>table,td,a,span{font-family:'Segoe UI',Arial,sans-serif !important;}</style><![endif]-->
<style>${DARK_CSS}</style>
</head>
<body class="bg" style="margin:0;padding:0;background-color:#f2f5fe;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(input.preheader)}${PREHEADER_PAD}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" bgcolor="#f2f5fe" style="background-color:#f2f5fe;">
<tr><td align="center" class="outer" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="container" style="width:600px;max-width:600px;">
<tr><td class="px" style="padding:4px 8px 16px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="40" height="40" align="center" valign="middle" bgcolor="#4772FA" style="width:40px;height:40px;background-color:#4772FA;border-radius:10px;font-size:0;line-height:0;"><img src="${escapeHtml(icon)}" width="32" height="32" alt="" border="0" style="display:block;width:32px;height:32px;border:0;outline:none;text-decoration:none;"></td>
<td class="ink" style="padding-left:10px;font-family:${MAIL_FONT};font-size:15px;line-height:18px;font-weight:600;color:#191919;">TickTackDone</td>
</tr></table>
</td></tr>
<tr><td class="surface px" bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #e6e9f2;border-radius:14px;padding:28px 32px;font-family:${MAIL_FONT};color:#191919;">
${input.bodyHtml}
</td></tr>
<tr><td class="px" style="padding:20px 8px 8px 8px;font-family:${MAIL_FONT};font-size:13px;line-height:20px;">
<p class="ink2" style="margin:0 0 8px 0;color:#6b6b6b;">${escapeHtml(input.reason)}</p>
<p style="margin:0 0 8px 0;"><a href="${escapeHtml(notifications)}" class="accink" style="color:#3e60cd;font-weight:600;text-decoration:underline;">${manage}</a><span class="ink2" style="color:#6b6b6b;">&nbsp;·&nbsp;</span><a href="${escapeHtml(home)}" class="accink" style="color:#3e60cd;font-weight:600;text-decoration:underline;">${open}</a></p>
<p class="ink2" style="margin:0;color:#6b6b6b;font-size:12px;">TickTackDone · ${escapeHtml(host)}</p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
  const text = [
    'TickTackDone',
    '',
    input.bodyText.trim(),
    '',
    input.reason,
    `${manage}: ${notifications}`,
    `${open}: ${home}`,
    '',
    `TickTackDone · ${host}`,
  ].join('\n');
  return { html, text };
}

/** Title plus plain paragraphs, for a notice that has no view of its own. */
export function renderPlainNotice(input: {
  readonly locale?: MailLocale | undefined;
  readonly title: string;
  readonly body: string;
  readonly reason?: string | undefined;
  readonly origin?: string | undefined;
}): RenderedMail {
  const locale = input.locale ?? 'es';
  const reason =
    input.reason ??
    (locale === 'en'
      ? 'You receive this email because of your TickTackDone notifications.'
      : 'Recibes este correo por tus avisos de TickTackDone.');
  const laid = renderEmailLayout({
    locale,
    documentTitle: input.title,
    preheader: input.body.replace(/\s+/g, ' ').trim().slice(0, 140),
    bodyHtml: `<h1 class="ink h1" style="margin:0 0 12px 0;font-size:24px;line-height:30px;font-weight:700;color:#191919;">${escapeHtml(input.title)}</h1>${textParagraphs(input.body)}`,
    bodyText: input.body.trim(),
    reason,
    ...(input.origin === undefined ? {} : { origin: input.origin }),
  });
  return { subject: input.title, text: laid.text, html: laid.html };
}

export function mailOrigin(origin?: string): string {
  return (origin ?? publicOrigin()).replace(/\/$/, '');
}

function originHost(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return 'todo.reflexionia.com';
  }
}
