import { describe, expect, it } from 'vitest';
import { classifyRefresh } from './oauth-refresh.js';

describe('refresh token rotation', () => {
  const now = new Date('2026-10-20T10:00:00Z');

  it('rotates an active token and treats a spent one as reuse', () => {
    expect(
      classifyRefresh(
        { rotatedAt: null, revokedAt: null, expiresAt: new Date('2026-11-20T10:00:00Z') },
        now,
      ),
    ).toBe('rotate');
    expect(
      classifyRefresh(
        {
          rotatedAt: new Date('2026-10-20T09:00:00Z'),
          revokedAt: null,
          expiresAt: new Date('2026-11-20T10:00:00Z'),
        },
        now,
      ),
    ).toBe('reuse');
    expect(
      classifyRefresh(
        {
          rotatedAt: null,
          revokedAt: new Date('2026-10-20T09:00:00Z'),
          expiresAt: new Date('2026-11-20T10:00:00Z'),
        },
        now,
      ),
    ).toBe('reuse');
    expect(
      classifyRefresh(
        { rotatedAt: null, revokedAt: null, expiresAt: new Date('2026-10-20T09:00:00Z') },
        now,
      ),
    ).toBe('expired');
    expect(classifyRefresh(null, now)).toBe('unknown');
  });
});
