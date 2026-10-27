import { resolveLocale, useLocale } from '../../i18n/locale';
export const es = {
  range: 'Entre {min} y {max}, de {step} en {step}',
  move: 'Mover al {date}',
  rule: 'Cambiar la regla',
  googleTitle: 'Google',
  connected: 'Conectado',
  disconnectGoogle: 'Desconectar Google',
  attachRequiresDrive: 'Para adjuntar ficheros, Google Drive debe estar activo.',
  reconnect: 'Reconectar',
  calendarPermission: 'Calendar · lectura y escritura',
  drivePermission: 'Drive · solo ficheros de ttd',
  disconnect: 'Desconectar',
  calendarEffect:
    'Los calendarios dejan de sincronizarse. Los eventos importados se conservan salvo que elijas borrarlos.',
  driveEffect: 'Los adjuntos siguen en tu Drive como enlaces, pero no puedes subir nuevos.',
  revokeEffect: 'Se revoca el acceso también en Google.',
  disconnected: 'Google desconectado. Puedes revisar los permisos en',
};
export const en: typeof es = {
  range: 'Between {min} and {max}, in steps of {step}',
  move: 'Move to {date}',
  rule: 'Change the rule',
  googleTitle: 'Google',
  connected: 'Connected',
  disconnectGoogle: 'Disconnect Google',
  attachRequiresDrive: 'Google Drive must be active to attach files.',
  reconnect: 'Reconnect',
  calendarPermission: 'Calendar · read and write',
  drivePermission: 'Drive · ttd files only',
  disconnect: 'Disconnect',
  calendarEffect:
    'Calendars stop syncing. Imported events remain unless you choose to delete them.',
  driveEffect: 'Attachments remain in your Drive as links, but you cannot upload new files.',
  revokeEffect: 'Access is also revoked at Google.',
  disconnected: 'Google disconnected. You can review permissions at',
};
export function useWtEMessages() {
  const choice = useLocale((state) => state.choice);
  return resolveLocale(choice).startsWith('en') ? en : es;
}
