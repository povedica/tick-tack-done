import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors.js';
import { createApiClient } from './client.js';

describe('createApiClient onUnauthorized (TTD-AUD-29)', () => {
  it('notifies and throws on 401', async () => {
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseUrl: 'http://example.test',
      onUnauthorized,
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'gone' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await expect(client.getTask('11111111-1111-4111-8111-111111111111')).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(onUnauthorized).toHaveBeenCalledWith('/api/v1/tasks/11111111-1111-4111-8111-111111111111');
  });
});
