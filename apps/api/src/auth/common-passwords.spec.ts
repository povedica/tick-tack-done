import { describe, expect, it } from 'vitest';
import { commonPasswordCount, isCommonPassword } from './common-passwords.js';

describe('D-4 common passwords', () => {
  it('loads a local list of 10000 and matches case-insensitively', () => {
    expect(commonPasswordCount()).toBe(10000);
    expect(isCommonPassword('password')).toBe(true);
    expect(isCommonPassword('PASSWORD')).toBe(true);
    expect(isCommonPassword('correct horse battery staple extra')).toBe(false);
  });
});
