import { messagesFor } from '../i18n';
import { useLocale } from '../i18n/locale';
import { useActionToast } from './action-toast';

export interface ActionOptions<T> {
  readonly success?: (value: T) => void | Promise<void>;
  readonly rollback?: () => void | Promise<void>;
}

/** A single visible, localized error path; server details and secrets never enter the toast. */
export function reportActionError(_cause: unknown): void {
  const choice = useLocale.getState().choice;
  const locale =
    choice === 'auto' && typeof navigator !== 'undefined' ? navigator.language : choice;
  useActionToast.getState().fail(messagesFor(locale).actionFailed);
}

/** RF-201/RF-208: detached UI actions always settle; optimistic callers can restore state. */
export function runAction<T>(promise: PromiseLike<T>, options: ActionOptions<T> = {}): void {
  const finish = async (): Promise<void> => {
    try {
      const result = await promise;
      await options.success?.(result);
    } catch (cause) {
      try {
        await options.rollback?.();
      } finally {
        reportActionError(cause);
      }
    }
  };
  void finish().catch(reportActionError);
}

/** Last-resort feedback for promises outside the typed UI action paths. */
export function installActionErrorFallback(): () => void {
  const onRejection = (event: PromiseRejectionEvent): void => {
    reportActionError(event.reason);
  };
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
