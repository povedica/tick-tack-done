import { afterEach, expect, it, vi } from 'vitest';
import { authorizeUrl, readState, redirectFor, signState } from './google-oauth.js';
afterEach(() => vi.unstubAllEnvs());
it('Calendar and Drive use one client and incremental scopes; state identifies the requested product', () => {
  vi.stubEnv('APP_SECRET', 'synthetic-secret-at-least-16');
  vi.stubEnv('PUBLIC_URL', 'https://example.test');
  vi.stubEnv('GOOGLE_CLIENT_ID', 'shared-client');
  const callback = redirectFor('https://example.test');
  expect(callback).toBe('https://example.test/api/v1/integrations/google/callback');
  const calendar = new URL(authorizeUrl(callback ?? '', 'state', 'calendar'));
  const drive = new URL(authorizeUrl(callback ?? '', 'state', 'drive'));
  expect(calendar.searchParams.get('scope')).not.toContain('drive.file');
  expect(drive.searchParams.get('scope')).not.toContain('calendar');
  expect(drive.searchParams.get('client_id')).toBe('shared-client');
  expect(drive.searchParams.get('include_granted_scopes')).toBe('true');
  const state = signState({
    uid: 'owner',
    exp: Date.now() + 60000,
    redirect: callback ?? '',
    requested: 'drive',
  });
  expect(readState(state)?.requested).toBe('drive');
  expect(readState(state + 'x')).toBeNull();
});

it('rejects malformed state parameter types before cryptographic operations', () => {
  expect(readState(['state', 'value'])).toBeNull();
  expect(readState({ value: 'state' })).toBeNull();
  expect(readState(undefined)).toBeNull();
});
