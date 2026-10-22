import { expect, it, vi } from 'vitest';
import { safeFetch } from '../../security/safe-fetch.js';
import { linkTitle } from './link-title.js';
vi.mock('../../security/safe-fetch.js', () => ({ safeFetch: vi.fn() }));
it('TTD-AUD-100: optional unfurl is bounded HTML and tolerates blocked destinations', async () => {
  vi.mocked(safeFetch).mockRejectedValueOnce(new Error('blocked'));
  expect(await linkTitle('http://169.254.169.254/')).toBeNull();
  vi.mocked(safeFetch).mockResolvedValueOnce({
    status: 200,
    body: Buffer.from('<title> A &amp; B </title>'),
  });
  expect(await linkTitle('https://example.com')).toBe('A & B');
  expect(safeFetch).toHaveBeenLastCalledWith(
    'https://example.com',
    expect.objectContaining({
      maxBytes: 262144,
      timeoutMs: 3000,
      maxRedirects: 3,
      contentType: 'text/html',
      allowHttp: true,
    }),
  );
  expect(await linkTitle('mailto:test@example.com')).toBeNull();
});
