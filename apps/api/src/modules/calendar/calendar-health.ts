/** Connection health for a calendar subscription (RF-2563). Computed, not stored. */
export const CALENDAR_RECONNECT_ERRORS = [
  'google_reconnect_required',
  'google_not_connected',
  'google_permission_required',
  'google_scope_missing',
] as const;

export type CalendarHealth = 'ok' | 'error' | 'reconnect_required';

const RECONNECT = new Set<string>(CALENDAR_RECONNECT_ERRORS);

export function isReconnectError(code: string | null | undefined): boolean {
  return code !== undefined && code !== null && RECONNECT.has(code);
}

export function subscriptionHealth(input: {
  readonly provider: string | null;
  readonly lastError: string | null;
  readonly googleStatus: string | null;
}): CalendarHealth {
  const accountNeedsReauth =
    input.provider === 'google' && input.googleStatus === 'reauth_required';
  if (accountNeedsReauth || isReconnectError(input.lastError)) {
    return 'reconnect_required';
  }
  if (input.lastError !== null && input.lastError.length > 0) {
    return 'error';
  }
  return 'ok';
}

/** reconnect_required outranks error, which outranks ok (RF-2563). */
export function worstHealth(values: readonly CalendarHealth[]): CalendarHealth {
  if (values.includes('reconnect_required')) {
    return 'reconnect_required';
  }
  if (values.includes('error')) {
    return 'error';
  }
  return 'ok';
}
