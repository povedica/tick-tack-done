import { afterEach, describe, expect, it, vi } from 'vitest';
import { sealField } from '../security/field-cipher.js';
import { userGoogleRefreshToken } from './user-google-token.js';

afterEach(() => vi.unstubAllEnvs());
describe('TTD-AUD-86 legacy Google seed credential policy', () => {
  it.each(['production', 'test', ''])('refuses the global credential in %s', (mode) => {
    vi.stubEnv('NODE_ENV', mode);
    vi.stubEnv('DEV_GOOGLE_USER_EMAIL', 'seed@example.test');
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'synthetic-legacy');
    expect(() =>
      userGoogleRefreshToken({ email: 'seed@example.test', googleRefreshToken: null }),
    ).toThrow('Connect Google');
  });
  it('allows only the explicit development seed and prefers a stored user credential', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_GOOGLE_USER_EMAIL', 'seed@example.test');
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'synthetic-legacy');
    expect(userGoogleRefreshToken({ email: 'seed@example.test', googleRefreshToken: null })).toBe(
      'synthetic-legacy',
    );
    expect(() =>
      userGoogleRefreshToken({ email: 'other@example.test', googleRefreshToken: '' }),
    ).toThrow('Connect Google');
    expect(() => userGoogleRefreshToken(null)).toThrow('Connect Google');
    expect(
      userGoogleRefreshToken({
        email: 'other@example.test',
        googleRefreshToken: sealField('synthetic-owned'),
        googleGrantedScopes: [
          'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
          'https://www.googleapis.com/auth/calendar.events',
        ],
        googleCalendarEnabled: true,
        googleDriveEnabled: true,
      }),
    ).toBe('synthetic-owned');
  });
});
