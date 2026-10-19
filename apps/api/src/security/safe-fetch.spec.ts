import { describe, expect, it } from 'vitest';
import { assertPublicUrl, isBlockedAddress, type LookupAddress } from './safe-fetch';

const lookup =
  (address: string): LookupAddress =>
  () =>
    Promise.resolve({ address, family: address.includes(':') ? 6 : 4 });

describe('safe fetch destinations', () => {
  it('rejects loopback, link-local, private and single-label hosts', async () => {
    await expect(assertPublicUrl('https://127.0.0.1:5432')).rejects.toThrow(
      /not an allowed destination/,
    );
    await expect(assertPublicUrl('https://[::1]:1/zz')).rejects.toThrow(
      /not an allowed destination/,
    );
    await expect(assertPublicUrl('https://169.254.169.254/')).rejects.toThrow(
      /not an allowed destination/,
    );
    await expect(assertPublicUrl('https://10.1.2.3/')).rejects.toThrow(
      /not an allowed destination/,
    );
    await expect(assertPublicUrl('https://redis:6379', lookup('10.0.0.8'))).rejects.toThrow(
      /not an allowed destination/,
    );
    await expect(
      assertPublicUrl('https://127.0.0.1.nip.io:1/zz', lookup('127.0.0.1')),
    ).rejects.toThrow(/not an allowed destination/);
    await expect(assertPublicUrl('http://example.com', lookup('1.1.1.1'))).rejects.toThrow(
      /url must be https/,
    );
  });

  it('accepts a public https address', async () => {
    const target = await assertPublicUrl('https://example.com/feed.ics', lookup('1.1.1.1'));
    expect(target.address).toBe('1.1.1.1');
    expect(isBlockedAddress('1.1.1.1')).toBe(false);
    expect(isBlockedAddress('::1')).toBe(true);
  });
});
