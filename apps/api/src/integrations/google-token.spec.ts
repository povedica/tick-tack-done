import { afterEach, expect, it, vi } from 'vitest';
import { exchangeGoogleRefreshToken } from './google-token.js';
import { tokenHasCalendarScope } from './google-calendar.js';
import { authorizeUrl } from '../modules/integrations/google-oauth.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('TTD-AUD-47: requests narrower Calendar permissions and retains granted scopes', () => {
  const url = new URL(authorizeUrl('https://example.test/callback', 'state'));
  const scopes = url.searchParams.get('scope')?.split(' ') ?? [];
  expect(scopes).not.toContain('https://www.googleapis.com/auth/calendar');
  expect(scopes).toContain('https://www.googleapis.com/auth/calendar.events');
  expect(url.searchParams.get('include_granted_scopes')).toBe('true');
});
it('TTD-AUD-43: invalid_grant is a reconnect error and never a session 401', async () => {
  vi.stubEnv('GOOGLE_CLIENT_ID', 'fixture');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'fixture');
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })),
  );
  await expect(exchangeGoogleRefreshToken('fixture-refresh')).rejects.toMatchObject({
    response: { code: 'google_reconnect_required' },
    status: 502,
  });
});
it('RF-2516: scope detection accepts existing grants and narrower grants', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  for (const scope of [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events',
  ]) {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ scope })));
    expect(await tokenHasCalendarScope('fixture-access')).toBe(true);
  }
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ scope: 'openid email' })));
  expect(await tokenHasCalendarScope('fixture-access')).toBe(false);
});
