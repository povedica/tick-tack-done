import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './passwords';

describe('passwords', () => {
  it('stores Argon2id and rejects a different password', async () => {
    const hash = await hashPassword('correct-horse');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'correct-horse')).toBe(true);
    expect(await verifyPassword(hash, 'other-horse')).toBe(false);
  });
});
