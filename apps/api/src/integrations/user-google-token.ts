import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../http/domain.exception.js';
import { openField } from '../security/field-cipher.js';

/** Never share an account's credentials with another owner (TTD-AUD-86). */
export function userGoogleRefreshToken(
  user: { email: string; googleRefreshToken: string | null } | null,
): string {
  if (user?.googleRefreshToken) return openField(user.googleRefreshToken);
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
