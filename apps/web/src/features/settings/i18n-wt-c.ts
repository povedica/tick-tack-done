import { useLocale, resolveLocale } from '../../i18n/locale';
export const es = {
  none: 'Sin configurar',
  token_saved: 'Pendiente de vincular',
  webhook_ok: 'Pendiente de vincular',
  linked: 'Conectado',
  blocked: 'Bloqueado',
  error: 'Error: revisa la configuración',
  connect: 'Conectar bot',
  replace: 'Reemplazar token',
  remove: 'Quitar bot',
  retry: 'Reintentar webhook',
  force: 'Tomar el control del bot',
  telegram_token_invalid: 'El token no es válido. Comprueba el token de BotFather.',
  telegram_bot_in_use: 'Este bot pertenece a otra cuenta. Usa un bot exclusivo.',
  telegram_webhook_in_use:
    'El bot tiene un webhook en otra URL. Toma el control solo si no lo usas en otro entorno.',
  telegram_configuration_failed: 'No se pudo configurar Telegram. Reintenta el webhook.',
  pushUnavailable: 'No configurado en el servidor',
};
export const en: Record<keyof typeof es, string> = {
  none: 'Not configured',
  token_saved: 'Waiting to link',
  webhook_ok: 'Waiting to link',
  linked: 'Connected',
  blocked: 'Blocked',
  error: 'Error: check configuration',
  connect: 'Connect bot',
  replace: 'Replace token',
  remove: 'Remove bot',
  retry: 'Retry webhook',
  force: 'Take control of the bot',
  telegram_token_invalid: 'Invalid token. Check the token from BotFather.',
  telegram_bot_in_use: 'This bot belongs to another account. Use a dedicated bot.',
  telegram_webhook_in_use:
    'The bot has a webhook at another URL. Take control only if you do not use it in another environment.',
  telegram_configuration_failed: 'Could not configure Telegram. Retry the webhook.',
  pushUnavailable: 'Not configured on the server',
};
export type TelegramUiState =
  'none' | 'token_saved' | 'webhook_ok' | 'linked' | 'blocked' | 'error';
export function telegramUiState(value: Record<string, unknown> | undefined): TelegramUiState {
  const state = value?.state;
  if (
    state === 'none' ||
    state === 'token_saved' ||
    state === 'webhook_ok' ||
    state === 'linked' ||
    state === 'blocked' ||
    state === 'error'
  )
    return state;
  if (value?.webhook_state === 'local_only') return 'token_saved';
  return value?.status === 'blocked'
    ? 'blocked'
    : value?.linked === true
      ? 'linked'
      : value?.configured === true
        ? 'webhook_ok'
        : 'none';
}
export function useWtCMessages() {
  const locale = useLocale((state) => state.choice);
  return resolveLocale(locale).toLowerCase().startsWith('en') ? en : es;
}
