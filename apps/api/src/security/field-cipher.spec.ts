import { describe, expect, it } from 'vitest';
import { isSealed, openField, sealField } from './field-cipher.js';

describe('field cipher', () => {
  it('round-trips and hides the plaintext', () => {
    process.env.DATA_ENCRYPTION_KEY = 'ab'.repeat(32);
    const sealed = sealField('totp-secret');
    expect(sealed.startsWith('enc1:')).toBe(true);
    expect(sealed).not.toContain('totp-secret');
    expect(isSealed(sealed)).toBe(true);
    expect(openField(sealed)).toBe('totp-secret');
    expect(openField('legacy-plain')).toBe('legacy-plain');
  });
});
