import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../http/domain.exception';
import { googleConfigured } from './config';

/** Exchanges the stored refresh token. The env var is only a fallback for the caller. */
export async function exchangeGoogleRefreshToken(refreshToken: string): Promise<string> {
  if (!googleConfigured() || refreshToken.length === 0) {
    throw new DomainException(
      HttpStatus.SERVICE_UNAVAILABLE,
      'google_not_configured',
      'Connect Google from settings before using Google',
    );
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new DomainException(
      HttpStatus.BAD_GATEWAY,
      'google_push_failed',
      'Google token exchange failed',
    );
  }
  const body = (await response.json()) as { access_token?: unknown };
  if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
    throw new DomainException(
      HttpStatus.BAD_GATEWAY,
      'google_push_failed',
      'Google did not return an access token',
    );
  }
  return body.access_token;
}
