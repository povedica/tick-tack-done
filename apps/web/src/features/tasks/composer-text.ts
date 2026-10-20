import { useAppLocale } from '../../i18n/locale';
export function useComposerCopy() {
  const english = useAppLocale().startsWith('en');
  return {
    options: english ? 'Task options' : 'Opciones de tarea',
    templates: english ? 'Add from template' : 'Añadir desde plantilla',
    noTemplates: english ? 'No saved templates' : 'No hay plantillas guardadas',
    queued: english
      ? 'Saved offline. It will sync when you reconnect.'
      : 'Guardada sin conexión. Se sincronizará al reconectar.',
    filesOnline: english ? 'Connect to upload attachments.' : 'Conéctate para subir los adjuntos.',
    uploadRetry: english
      ? 'Task created. Retry to upload the remaining attachments.'
      : 'Tarea creada. Reintenta para subir los adjuntos restantes.',
  };
}
