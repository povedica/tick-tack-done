import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../http/domain.exception.js';
import { googleServiceAccess, type GoogleAccessAccount } from './google-access.js';
import { openField } from '../security/field-cipher.js';

/** Never share an account's credentials with another owner (TTD-AUD-86). */
export function userGoogleRefreshToken(
  user:
    | ({ email: string } & Partial<GoogleAccessAccount> & { googleRefreshToken: string | null })
    | null,
): string {
  if (user?.googleRefreshToken) {
    const access = googleServiceAccess(
      {
        ...user,
        googleGrantedScopes: user.googleGrantedScopes ?? [],
        googleCalendarEnabled: user.googleCalendarEnabled ?? true,
        googleDriveEnabled: user.googleDriveEnabled ?? true,
      },
      'calendar',
    );
    if (!access.connected)
      throw new DomainException(
        409,
        access.status === 'disabled'
          ? 'google_service_disabled'
          : access.status === 'reauth_required'
            ? 'google_reconnect_required'
            : 'google_permission_required',
        'Authorize or enable Calendar in Settings > Integrations',
      );
    return openField(user.googleRefreshToken);
  }
  const seed = process.env.DEV_GOOGLE_USER_EMAIL;
  const legacy = process.env.GOOGLE_REFRESH_TOKEN;
  if (process.env.NODE_ENV === 'development' && seed && legacy && user?.email === seed)
    return legacy;
  throw new DomainException(
    HttpStatus.CONFLICT,
    'google_not_connected',
    'Connect Google from Settings > Integrations',
  );
}
