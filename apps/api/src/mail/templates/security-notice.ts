import { type MailLocale, type RenderedMail } from './html.js';
import { renderPlainNotice } from './layout.js';

export function renderAccountDeletion(input: {
  readonly locale: MailLocale;
  readonly origin?: string | undefined;
}): RenderedMail {
  if (input.locale === 'en') {
    return renderPlainNotice({
      locale: 'en',
      title: 'Account deletion',
      body: 'Your account is being deleted. If this was not you, the deletion has already been confirmed with your password.',
      reason: 'You receive this email because of a security notice about your account.',
      ...(input.origin === undefined ? {} : { origin: input.origin }),
    });
  }
  return renderPlainNotice({
    locale: 'es',
    title: 'Se va a borrar tu cuenta',
    body: 'Tu cuenta se está borrando. Si no has sido tú, el borrado ya se ha confirmado con tu contraseña.',
    reason: 'Recibes este correo por un aviso de seguridad de tu cuenta.',
    ...(input.origin === undefined ? {} : { origin: input.origin }),
  });
}

export function renderTotpDisabled(input: {
  readonly locale: MailLocale;
  readonly origin?: string | undefined;
}): RenderedMail {
  if (input.locale === 'en') {
    return renderPlainNotice({
      locale: 'en',
      title: 'Two-factor authentication was turned off',
      body: 'An administrator turned off two-factor authentication on your tick-tack-done account. If this was not you, reset your password and contact the operator.',
      reason: 'You receive this email because of a security notice about your account.',
      ...(input.origin === undefined ? {} : { origin: input.origin }),
    });
  }
  return renderPlainNotice({
    locale: 'es',
    title: 'Se desactivó la verificación en dos pasos',
    body: 'Un administrador desactivó la verificación en dos pasos de tu cuenta de tick-tack-done. Si no has sido tú, restablece la contraseña y avisa a quien opera el servicio.',
    reason: 'Recibes este correo por un aviso de seguridad de tu cuenta.',
    ...(input.origin === undefined ? {} : { origin: input.origin }),
  });
}
