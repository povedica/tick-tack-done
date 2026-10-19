import { ApiError } from '@reflexionia/sdk';

export function failureMessage(reason: unknown, fallback: string): string {
  if (reason instanceof ApiError && reason.message.trim().length > 0) {
    return reason.message;
  }
  return fallback;
}
