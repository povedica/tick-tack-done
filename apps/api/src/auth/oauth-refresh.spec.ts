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

describe('TTD-AUD-80 / RF-2001 refresh retry grace', () => {
  const now = new Date('2026-10-22T10:00:00Z');
  const row = {
    rotatedAt: new Date(now.getTime() - 60_000),
    revokedAt: null,
    expiresAt: new Date(now.getTime() + 3600_000),
  };
  it('replays at the inclusive 60 second boundary', () => {
    expect(classifyRefresh(row, now)).toBe('replay');
  });
  it('rejects reuse at 61 seconds', () => {
    expect(classifyRefresh({ ...row, rotatedAt: new Date(now.getTime() - 61_000) }, now)).toBe(
      'reuse',
    );
  });
  it('never replays a revoked or expired token, or a future rotation', () => {
    expect(classifyRefresh({ ...row, revokedAt: now }, now)).toBe('reuse');
    expect(classifyRefresh({ ...row, expiresAt: now }, now)).toBe('expired');
    expect(classifyRefresh({ ...row, rotatedAt: new Date(now.getTime() + 1) }, now)).toBe('reuse');
  });
});
