import { describe, expect, it } from 'vitest';
import { orderedSmartLists, SIDEBAR_SMART_ORDER } from './smart-order';

const GAP = 65536;

describe('orderedSmartLists', () => {
  it('S1: the seeded string order renders as §4.5', () => {
    const legacy = [
      'today',
      'tomorrow',
      'next_7_days',
      'all',
      'inbox',
      'assigned_to_me',
      'completed',
      'trash',
      'no_date',
      'recently_added',
    ].map((key, index) => ({ key, sort_order: String(GAP * (index + 1)) }));
    const keys = orderedSmartLists(legacy).map((item) => item.key);
    expect(keys.slice(0, SIDEBAR_SMART_ORDER.length)).toEqual([...SIDEBAR_SMART_ORDER]);
    expect(keys.at(-1)).toBe('trash');
    expect(keys).toContain('assigned_to_me');
  });

  it('S1: a custom numeric order is kept', () => {
    const custom = [
      { key: 'inbox', sort_order: '1' },
      { key: 'today', sort_order: '2' },
    ];
    expect(orderedSmartLists(custom).map((item) => item.key)).toEqual(['inbox', 'today']);
  });
});
