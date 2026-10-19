import argon2 from 'argon2';
import { describe, expect, it, vi } from 'vitest';
import { hashPassword, verifyPassword, verifyPresentedPassword } from './passwords.js';

describe('passwords', () => {
  it('stores Argon2id and rejects a different password', async () => {
    const hash = await hashPassword('correct-horse');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'correct-horse')).toBe(true);
    expect(await verifyPassword(hash, 'other-horse')).toBe(false);
  });

  it('S-01: verifies a dummy hash when the account does not exist', async () => {
    const spy = vi.spyOn(argon2, 'verify');
    expect(await verifyPresentedPassword(null, 'nope')).toBe(false);
    expect(spy).toHaveBeenCalled();
    const hash = await hashPassword('correct-horse');
    expect(await verifyPresentedPassword(hash, 'correct-horse')).toBe(true);
    spy.mockRestore();
  });
});
