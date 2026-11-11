import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';

describe('RF-PR-10 SDK password reset', () => {
  it('calls request, verify and confirm', async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/request')) {
        return Promise.resolve(Response.json({ status: 'accepted' }, { status: 202 }));
      }
      if (url.endsWith('/verify')) {
        return Promise.resolve(
          Response.json({
            valid: true,
            totp_required: false,
            expires_at: '2026-01-01T00:00:00.000Z',
          }),
        );
      }
      expect(init?.method).toBe('POST');
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    const client = createApiClient({ baseUrl: 'http://example.test', fetchImpl });
    await client.requestPasswordReset({ email: 'ada@example.test' });
    const verified = await client.verifyPasswordReset({ token: 'a'.repeat(43) });
    expect(verified.totp_required).toBe(false);
    await client.confirmPasswordReset({ token: 'a'.repeat(43), new_password: 'correct-horse' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
