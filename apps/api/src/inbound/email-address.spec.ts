import { describe, expect, it } from 'vitest';
import {
  hashInboundToken,
  inboundAddress,
  inboundLocalPart,
  newInboundToken,
} from './email-address';

describe('inbound email address', () => {
  it('RF-105: hashes the token and keeps the address on the inbound domain', () => {
    const token = newInboundToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(inboundAddress(token)).toBe(`${token}@in.todo.reflexionia.com`);
    expect(hashInboundToken(token)).toHaveLength(64);
    expect(hashInboundToken(token)).not.toBe(token);
    expect(inboundLocalPart(inboundAddress(token))).toBe(token);
    expect(inboundLocalPart(`  ${token}@IN.TODO.REFLEXIONIA.COM`)).toBe(token);
  });

  it('RF-105: rejects another domain, a short secret and a list of recipients', () => {
    expect(inboundLocalPart('abc@in.todo.reflexionia.com')).toBeNull();
    expect(inboundLocalPart(`${'a'.repeat(32)}@example.com`)).toBeNull();
    expect(
      inboundLocalPart(`${'a'.repeat(32)}@in.todo.reflexionia.com,other@in.todo.reflexionia.com`),
    ).toBeNull();
  });
});
