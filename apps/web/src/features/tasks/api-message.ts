import { ApiError } from '@reflexionia/sdk';
import type { Messages } from '../../i18n';

/** Maps a known API failure to UI copy. Unknown failures stay generic. */
export function apiMessage(reason: unknown, messages: Messages): string {
  if (!(reason instanceof ApiError)) {
    return messages.saveFailed;
  }
  const text = reason.message.trim().toLowerCase();
  if (reason.code === 'wip_exceeded') {
    return messages.wipExceeded;
  }
  if (text.includes('repeating task needs a due_date') || text.includes('missing_anchor')) {
    return messages.errorRepeatNeedsDate;
  }
  if (text.includes('repeat_rule')) {
    return messages.errorRepeatInvalid;
  }
  if (reason.status === 413 || text.includes('too large') || text.includes('file too')) {
    return messages.tooLarge;
  }
  if (reason.code === 'validation_failed') {
    return messages.errorValidation;
  }
  return messages.saveFailed;
}
