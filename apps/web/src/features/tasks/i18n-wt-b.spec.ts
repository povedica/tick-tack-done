import { describe, expect, it } from 'vitest';
import { en, es, linkCountLabel } from './i18n-wt-b';
describe('RF-1002 TTD-AUD-108 messages', () => {
  it('keeps Spanish and English keys aligned', () => {
    expect(Object.keys(es)).toEqual(Object.keys(en));
  });
  it('TTD-AUD-128 selects accessible singular and plural link labels', () => {
    expect(linkCountLabel(1, 'es')).toBe('1 enlace');
    expect(linkCountLabel(2, 'es')).toBe('2 enlaces');
    expect(linkCountLabel(1, 'en')).toBe('1 link');
    expect(linkCountLabel(2, 'en')).toBe('2 links');
  });
});
