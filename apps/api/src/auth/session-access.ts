import { HttpStatus } from '@nestjs/common';
import type { AuthUser } from './auth-user.js';
import { DomainException } from '../http/domain.exception.js';

/** Token administration and account deletion are browser-session actions (S-15, S-16). */
export function requireBrowserSession(user: AuthUser): void {
  if (user.tokenId !== null) {
    throw new DomainException(
      HttpStatus.FORBIDDEN,
      'session_required',
      'This action requires a browser session',
    );
  }
  if (user.sessionId === null && process.env.AUTH_MODE !== 'dev') {
    throw new DomainException(
      HttpStatus.FORBIDDEN,
      'session_required',
      'This action requires a browser session',
    );
  }
}
