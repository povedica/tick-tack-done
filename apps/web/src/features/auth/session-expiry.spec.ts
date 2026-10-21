import { describe, expect, it } from 'vitest';
import { ApiError } from '@reflexionia/sdk';
import { isUnauthorized } from './session-expiry';

describe('session expiry (TTD-AUD-29)', () => {
  it('detects 401 ApiError and ignores other failures', () => {
    expect(isUnauthorized(new ApiError(401, 'unauthorized', 'gone'))).toBe(true);
    expect(isUnauthorized(new ApiError(500, 'server', 'boom'))).toBe(false);
    expect(isUnauthorized(new Error('network'))).toBe(false);
  });
});
