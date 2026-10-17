import { describe, expect, it } from 'vitest';
import { createsTagCycle, normalizeTagName, tagDescendantIds, tagNameKey } from './tags';

describe('tags', () => {
  it('RF-401: trims names and rejects empty or oversized ones', () => {
    expect(normalizeTagName('  casa  ')).toBe('casa');
    expect(normalizeTagName('   ')).toBeNull();
    expect(normalizeTagName('a'.repeat(101))).toBeNull();
  });

  it('RF-401: compares names without case', () => {
    expect(tagNameKey('Casa')).toBe(tagNameKey('casa'));
  });

  it('RF-401: refuses a parent that would cycle', () => {
    const parents = new Map<string, string | null>([
      ['root', null],
      ['child', 'root'],
      ['leaf', 'child'],
    ]);
    expect(createsTagCycle('root', 'leaf', parents)).toBe(true);
    expect(createsTagCycle('leaf', 'root', parents)).toBe(false);
    expect(createsTagCycle('child', null, parents)).toBe(false);
    expect(createsTagCycle('child', 'missing', parents)).toBe(false);
    const loop = new Map<string, string | null>([
      ['a', 'b'],
      ['b', 'a'],
    ]);
    expect(createsTagCycle('other', 'a', loop)).toBe(true);
  });

  it('RF-401: collects nested tags under a parent', () => {
    const children = new Map<string, readonly string[]>([
      ['root', ['a', 'b']],
      ['a', ['a1']],
    ]);
    expect(tagDescendantIds('root', children).sort()).toEqual(['a', 'a1', 'b']);
    expect(tagDescendantIds('missing', children)).toEqual([]);
  });

  it('stops when a tag tree links back to itself', () => {
    const children = new Map<string, readonly string[]>([
      ['root', ['a']],
      ['a', ['root']],
    ]);
    expect(tagDescendantIds('root', children)).toEqual(['a']);
  });
});
