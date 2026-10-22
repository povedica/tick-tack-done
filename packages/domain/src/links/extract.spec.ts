import { expect, it } from 'vitest';
import { extractUrls, normalizeTaskUrl } from './extract';

it('TTD-AUD-100: extracts supported URLs, deduplicates and strips prose punctuation', () => {
  expect(
    extractUrls(
      'ver https://example.com/a y www.ttd.dev. Otra https://example.com/a, mailto:test@example.test!',
    ),
  ).toEqual(['https://example.com/a', 'https://www.ttd.dev/', 'mailto:test@example.test']);
  expect(extractUrls('(https://example.com/a_(b)). javascript:alert(1) data:text/plain,x')).toEqual(
    ['https://example.com/a_(b)'],
  );
  expect(extractUrls('https://EXAMPLE.com/a https://example.com/a')).toEqual([
    'https://example.com/a',
  ]);
});
it('TTD-AUD-100: manual URLs allow http/https/mailto and reject executable schemes and credentials', () => {
  expect(normalizeTaskUrl('http://169.254.169.254/')).toBe('http://169.254.169.254/');
  expect(normalizeTaskUrl('www.ttd.dev')).toBe('https://www.ttd.dev/');
  expect(normalizeTaskUrl('mailto:test@example.test')).toBe('mailto:test@example.test');
  expect(normalizeTaskUrl('javascript:alert(1)')).toBeNull();
  expect(normalizeTaskUrl('https://user:password@example.com/')).toBeNull();
  expect(normalizeTaskUrl('file:///tmp/private')).toBeNull();
});

it('bounds trailing punctuation and unmatched delimiter processing linearly', () => {
  const before = Date.now();
  expect(extractUrls('https://example.test/a' + ')'.repeat(20000) + '!'.repeat(20000))).toEqual([
    'https://example.test/a',
  ]);
  expect(Date.now() - before).toBeLessThan(1000);
});
