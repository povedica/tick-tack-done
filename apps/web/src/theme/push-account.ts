import type { UpdateMeBody } from '@reflexionia/sdk';
import { api } from '../api';
import { useActionToast } from '../components/action-toast';
import { extraEn, extraEs } from '../i18n/extra';

function saveFailed(): string {
  let value: string | null = null;
  try {
    value = localStorage.getItem('tick-tack-done.locale');
  } catch {
    value = null;
  }
  const english =
    value === 'en' ||
    (value === 'auto' &&
      typeof navigator !== 'undefined' &&
      navigator.language.toLowerCase().startsWith('en'));
  return english ? extraEn.saveFailed : extraEs.saveFailed;
}

export function notifyAccountSaveFailed(): void {
  useActionToast.getState().show(saveFailed());
}

export function pushAccount(body: UpdateMeBody): void {
  void api.updateMe(body).catch(() => {
    notifyAccountSaveFailed();
  });
}
