import { describe, expect, it } from 'vitest';
import { assertInteractiveAdmin } from './disable-totp.js';

describe('D-6 admin disable totp', () => {
  it('refuses a non-interactive shell', () => {
    expect(() => {
      assertInteractiveAdmin(false);
    }).toThrow(/interactive shell/);
    expect(() => {
      assertInteractiveAdmin(true);
    }).not.toThrow();
  });
});
