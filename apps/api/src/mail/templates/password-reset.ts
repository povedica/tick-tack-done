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

export interface RenderedMail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
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
      '',
      '— tick-tack-done · todo.reflexionia.com',
    ].join('\n');
    return {
      subject: 'Reset your tick-tack-done password',
      text,
      html: layout(
        'Reset your tick-tack-done password',
        `<p>Hi ${escapeHtml(name)},</p><p>Someone (probably you) asked to reset the password on your tick-tack-done account.</p><p>To choose a new one, open this link within the next ${escapeHtml(minutes)} minutes:</p>${button(copy.url, 'Choose a new password')}<p>The link works once. If you didn't ask for this, ignore this email: your password stays the same.</p>`,
      ),
    };
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
    '',
    '— tick-tack-done · todo.reflexionia.com',
  ].join('\n');
  return {
    subject: 'Restablece tu contraseña de tick-tack-done',
    text,
    html: layout(
      'Restablece tu contraseña de tick-tack-done',
      `<p>Hola, ${escapeHtml(name)}:</p><p>Alguien (seguramente tú) ha pedido restablecer la contraseña de tu cuenta de tick-tack-done.</p><p>Para elegir una nueva, abre este enlace en los próximos ${escapeHtml(minutes)} minutos:</p>${button(copy.url, 'Elegir una contraseña nueva')}<p>El enlace solo funciona una vez. Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.</p>`,
    ),
  };
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
    return {
      subject: 'Your tick-tack-done password was changed',
      text,
      html: layout(
        'Your tick-tack-done password was changed',
        `<p>Hi ${escapeHtml(name)},</p><p>The password on your account was changed on ${escapeHtml(when)} from ${escapeHtml(where)}.</p><p>For safety we signed out every session and disconnected apps authorized with OAuth (for example ChatGPT or Claude). You will need to authorize them again.</p>${tokenLine.length > 0 ? `<p>${escapeHtml(tokenLine)}</p>` : ''}<p>If this was not you, request a new link at ${escapeHtml(copy.forgotUrl)} and review your tokens.</p>`,
      ),
    };
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
  return {
    subject: 'Tu contraseña de tick-tack-done ha cambiado',
    text,
    html: layout(
      'Tu contraseña de tick-tack-done ha cambiado',
      `<p>Hola, ${escapeHtml(name)}:</p><p>La contraseña de tu cuenta se cambió el ${escapeHtml(when)} desde ${escapeHtml(where)}.</p><p>Por seguridad hemos cerrado todas las sesiones y desconectado las apps conectadas por OAuth (por ejemplo ChatGPT o Claude); tendrás que volver a autorizarlas.</p>${tokenLine.length > 0 ? `<p>${escapeHtml(tokenLine)}</p>` : ''}<p>Si no has sido tú, pide un enlace nuevo en ${escapeHtml(copy.forgotUrl)} y revisa tus tokens.</p>`,
    ),
  };
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

function button(url: string, label: string): string {
  const safe = escapeHtml(url);
  return `<p><a href="${safe}" style="display:inline-block;padding:12px 18px;background:#4772FA;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(label)}</a></p><p><a href="${safe}">${safe}</a></p>`;
}

function layout(title: string, body: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f4f6fb"><div style="max-width:520px;margin:0 auto;background:#ffffff;padding:28px;border-radius:16px;font-family:sans-serif;color:#1c2434"><h1 style="font-size:20px">${escapeHtml(title)}</h1>${body}<p style="color:#5c6b82">tick-tack-done · todo.reflexionia.com</p></div></body></html>`;
}
