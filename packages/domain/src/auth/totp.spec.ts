import { describe, expect, it } from 'vitest';
import { randomBase32, recoveryCodes, sha256Hex, totpCode, verifyTotp } from './totp';

describe('totp', () => {
  it('verifies a code in the current window and rejects a short code', async () => {
    const secret = randomBase32(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    const now = Date.parse('2026-10-18T12:00:00.000Z');
    const code = await totpCode(secret, now);
    expect(code).toMatch(/^\d{6}$/);
    expect(await verifyTotp(secret, code ?? '', now)).toBe(true);
    expect(await verifyTotp(secret, '000000', now + 10 * 60_000)).toBe(false);
    expect(await verifyTotp(secret, '12', now)).toBe(false);
    expect(await totpCode('***', now)).toBeNull();
    expect(await totpCode(secret, Number.NaN)).toBeNull();
  });

  it('builds recovery codes and a stable hash', async () => {
    let step = 0;
    const codes = recoveryCodes(() => {
      step += 1;
      return step / 10;
    });
    expect(codes).toHaveLength(8);
    expect(await sha256Hex(codes[0] ?? '')).toHaveLength(64);
  });
});
