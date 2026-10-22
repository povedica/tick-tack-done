export type GoogleProduct = 'calendar' | 'drive';
export const GOOGLE_PRODUCT_SCOPES = {
  calendar: [
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/calendar.events',
  ],
  drive: ['https://www.googleapis.com/auth/drive.file'],
} as const;
export interface GoogleAccessAccount {
  googleRefreshToken: string | null;
  googleStatus?: string;
  googleGrantedScopes: readonly string[];
  googleCalendarEnabled: boolean;
  googleDriveEnabled: boolean;
}
export function googleServiceAccess(row: GoogleAccessAccount | null, service: GoogleProduct) {
  const scopes = row?.googleGrantedScopes ?? [];
  const has = (scope: string) => scopes.includes(scope);
  const calendarRoot = 'https://www.googleapis.com/auth/calendar';
  const granted =
    service === 'calendar'
      ? has(calendarRoot) ||
        ((has(`${calendarRoot}.calendarlist.readonly`) ||
          has(`${calendarRoot}.calendarlist`) ||
          has(`${calendarRoot}.readonly`)) &&
          has(`${calendarRoot}.events`))
      : has(GOOGLE_PRODUCT_SCOPES.drive[0]);
  const authorized = granted && !!row?.googleRefreshToken && row.googleStatus !== 'reauth_required';
  const enabled =
    service === 'drive' ? row?.googleDriveEnabled === true : row?.googleCalendarEnabled === true;
  const status = !row?.googleRefreshToken
    ? 'disconnected'
    : row.googleStatus === 'reauth_required'
      ? 'reauth_required'
      : !scopes.length
        ? 'permissions_unknown'
        : !authorized
          ? 'permission_required'
          : !enabled
            ? 'disabled'
            : 'connected';
  return { authorized, enabled, connected: status === 'connected', status };
}

export const GOOGLE_ACCESS_SELECT = {
  googleRefreshToken: true,
  googleStatus: true,
  googleGrantedScopes: true,
  googleCalendarEnabled: true,
  googleDriveEnabled: true,
} as const;
