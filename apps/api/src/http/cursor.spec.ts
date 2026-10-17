import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, matchesEtag, pageLimit, slicePage, weakEtag } from './cursor';

describe('cursor pagination', () => {
  it('defaults the page size and rejects values outside 1..100', () => {
    expect(pageLimit(undefined)).toBe(50);
    expect(pageLimit('25')).toBe(25);
    expect(() => pageLimit('0')).toThrow(/limit/);
    expect(() => pageLimit('101')).toThrow(/limit/);
  });

  it('round-trips a sort cursor and pages one extra row', () => {
    const cursor = encodeCursor('65536', '11111111-1111-4111-8111-111111111111');
    expect(decodeCursor(cursor)).toEqual({
      sortOrder: 65536n,
      id: '11111111-1111-4111-8111-111111111111',
    });
    const page = slicePage(
      [
        { id: 'a', sort_order: '1' },
        { id: 'b', sort_order: '2' },
      ],
      1,
    );
    expect(page.items).toEqual([{ id: 'a', sort_order: '1' }]);
    expect(page.next_cursor).toBe(encodeCursor('1', 'a'));
  });

  it('rejects a malformed cursor', () => {
    expect(() => decodeCursor('not-json')).toThrow(/cursor is invalid/);
  });

  it('matches weak etags', () => {
    const etag = weakEtag('[]');
    expect(matchesEtag(undefined, etag)).toBe(false);
    expect(matchesEtag(etag, etag)).toBe(true);
    expect(matchesEtag(`* , ${etag}`, etag)).toBe(true);
  });
});
