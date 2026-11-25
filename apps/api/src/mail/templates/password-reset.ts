import { emailButton, escapeHtml, rawLink, type RenderedMail } from './html.js';
import { renderEmailLayout } from './layout.js';

export type { RenderedMail } from './html.js';
export { escapeHtml } from './html.js';

export interface PasswordResetCopy {
  readonly locale: 'es' | 'en';
  readonly displayName: string;
  readonly url: string;
  readonly minutes: number;
}

export interface PasswordChangedCopy {
  readonly locale: 'es' | 'en';
  readonly displayName: string;
  readonly when: Date;
  readonly timeZone: string;
  readonly ip: string;
  readonly userAgent: string;
  readonly manualTokens: readonly string[];
  readonly settingsUrl: string;
  readonly forgotUrl: string;
}

export function renderPasswordReset(copy: PasswordResetCopy): RenderedMail {
  const name = copy.displayName.trim().length > 0 ? copy.displayName.trim() : '—';
  const minutes = String(copy.minutes);
  if (copy.locale === 'en') {
    const text = [
      `Hi ${name},`,
      '',
      'Someone (probably you) asked to reset the password on your tick-tack-done account.',
      '',
      `To choose a new one, open this link within the next ${minutes} minutes:`,
      copy.url,
      '',
      "The link works once. If you didn't ask for this, ignore this email: your password stays the same.",
    ].join('\n');
    return renderNotice({
      locale: 'en',
      subject: 'Reset your tick-tack-done password',
      text,
      html: `<p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">Hi ${escapeHtml(name)},</p><p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">Someone (probably you) asked to reset the password on your tick-tack-done account.</p><p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">To choose a new one, open this link within the next ${escapeHtml(minutes)} minutes:</p>${emailButton(copy.url, 'Choose a new password')}${rawLink(copy.url)}<p class="ink" style="margin:12px 0 0 0;font-size:15px;line-height:22px;color:#191919;">The link works once. If you didn't ask for this, ignore this email: your password stays the same.</p>`,
      reason: 'You receive this email because a password reset was requested for your account.',
    });
  }
  const text = [
    `Hola, ${name}:`,
    '',
    'Alguien (seguramente tú) ha pedido restablecer la contraseña de tu cuenta de tick-tack-done.',
    '',
    `Para elegir una nueva, abre este enlace en los próximos ${minutes} minutos:`,
    copy.url,
    '',
    'El enlace solo funciona una vez. Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.',
  ].join('\n');
  return renderNotice({
    locale: 'es',
    subject: 'Restablece tu contraseña de tick-tack-done',
    text,
    html: `<p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">Hola, ${escapeHtml(name)}:</p><p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">Alguien (seguramente tú) ha pedido restablecer la contraseña de tu cuenta de tick-tack-done.</p><p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">Para elegir una nueva, abre este enlace en los próximos ${escapeHtml(minutes)} minutos:</p>${emailButton(copy.url, 'Elegir una contraseña nueva')}${rawLink(copy.url)}<p class="ink" style="margin:12px 0 0 0;font-size:15px;line-height:22px;color:#191919;">El enlace solo funciona una vez. Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.</p>`,
    reason: 'Recibes este correo porque se pidió restablecer la contraseña de tu cuenta.',
  });
}

export function renderPasswordChanged(copy: PasswordChangedCopy): RenderedMail {
  const name = copy.displayName.trim().length > 0 ? copy.displayName.trim() : '—';
  const when = formatWhen(copy.when, copy.locale, copy.timeZone);
  const where = `${copy.ip} (${copy.userAgent})`;
  const names = copy.manualTokens.join(', ');
  const tokenLine =
    copy.manualTokens.length === 0
      ? ''
      : copy.locale === 'en'
        ? `Your personal tokens are still active (${String(copy.manualTokens.length)}: ${names}). Review them at ${copy.settingsUrl}.`
        : `Tus tokens personales siguen activos (${String(copy.manualTokens.length)}: ${names}). Revísalos en ${copy.settingsUrl}.`;
  if (copy.locale === 'en') {
    const text = [
      `Hi ${name},`,
      '',
      `The password on your account was changed on ${when} from ${where}.`,
      '',
      'For safety we signed out every session and disconnected apps authorized with OAuth (for example ChatGPT or Claude). You will need to authorize them again.',
      tokenLine,
      '',
      `If this was not you, request a new link at ${copy.forgotUrl} and review your tokens.`,
    ]
      .filter((line) => line.length > 0)
      .join('\n');
    return renderNotice({
      locale: 'en',
      subject: 'Your tick-tack-done password was changed',
      text,
      html: `<p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">Hi ${escapeHtml(name)},</p><p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">The password on your account was changed on ${escapeHtml(when)} from ${escapeHtml(where)}.</p><p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">For safety we signed out every session and disconnected apps authorized with OAuth (for example ChatGPT or Claude). You will need to authorize them again.</p>${tokenLine.length > 0 ? `<p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">${escapeHtml(tokenLine)}</p>` : ''}<p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">If this was not you, request a new link and review your tokens.</p>${emailButton(copy.forgotUrl, 'Request a new link')}${rawLink(copy.forgotUrl)}`,
      reason: 'You receive this email because the password on your account was changed.',
    });
  }
  const text = [
    `Hola, ${name}:`,
    '',
    `La contraseña de tu cuenta se cambió el ${when} desde ${where}.`,
    '',
    'Por seguridad hemos cerrado todas las sesiones y desconectado las apps conectadas por OAuth (por ejemplo ChatGPT o Claude); tendrás que volver a autorizarlas.',
    tokenLine,
    '',
    `Si no has sido tú, pide un enlace nuevo en ${copy.forgotUrl} y revisa tus tokens.`,
  ]
    .filter((line) => line.length > 0)
    .join('\n');
  return renderNotice({
    locale: 'es',
    subject: 'Tu contraseña de tick-tack-done ha cambiado',
    text,
    html: `<p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">Hola, ${escapeHtml(name)}:</p><p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">La contraseña de tu cuenta se cambió el ${escapeHtml(when)} desde ${escapeHtml(where)}.</p><p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">Por seguridad hemos cerrado todas las sesiones y desconectado las apps conectadas por OAuth (por ejemplo ChatGPT o Claude); tendrás que volver a autorizarlas.</p>${tokenLine.length > 0 ? `<p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">${escapeHtml(tokenLine)}</p>` : ''}<p class="ink" style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#191919;">Si no has sido tú, pide un enlace nuevo y revisa tus tokens.</p>${emailButton(copy.forgotUrl, 'Pedir un enlace nuevo')}${rawLink(copy.forgotUrl)}`,
    reason: 'Recibes este correo porque la contraseña de tu cuenta ha cambiado.',
  });
}

function renderNotice(input: {
  locale: 'es' | 'en';
  subject: string;
  text: string;
  html: string;
  reason: string;
}): RenderedMail {
  const laid = renderEmailLayout({
    locale: input.locale,
    documentTitle: input.subject,
    preheader: input.text.replace(/\s+/g, ' ').trim().slice(0, 140),
    bodyHtml: input.html,
    bodyText: input.text,
    reason: input.reason,
  });
  return { subject: input.subject, text: laid.text, html: laid.html };
}

function formatWhen(when: Date, locale: 'es' | 'en', timeZone: string): string {
  const zone = timeZone.trim().length > 0 ? timeZone : 'Europe/Madrid';
  const formatted = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: zone,
  }).format(when);
  return `${formatted} (${zone})`;
}
