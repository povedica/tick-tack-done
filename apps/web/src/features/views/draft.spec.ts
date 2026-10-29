import { describe, expect, it } from 'vitest';
import {
  blankDraft,
  draftFromSaved,
  groupsToDrop,
  incompleteIds,
  rulesFromDraft,
  saveIssue,
  simplifyDraft,
  type ConditionDraft,
  type FilterDraft,
} from './draft';

function keyword(value: string): ConditionDraft {
  return { ...blankDraft().groups[0]!.conditions[0]!, field: 'keyword', op: 'contains', value };
}

function draft(patch: Partial<FilterDraft> & Pick<FilterDraft, 'groups'>): FilterDraft {
  return {
    name: 'Casa · hoy',
    color: null,
    match: 'all',
    advanced: false,
    outer: 'AND',
    ...patch,
  };
}

describe('filter draft', () => {
  it('round-trips all, any and advanced groups', () => {
    const all = draft({
      groups: [{ id: 'g', combinator: 'AND', conditions: [keyword('informe')] }],
    });
    const any = draft({
      match: 'any',
      groups: [{ id: 'g', combinator: 'AND', conditions: [keyword('informe')] }],
    });
    const advanced = draft({
      advanced: true,
      outer: 'OR',
      groups: [
        { id: 'a', combinator: 'AND', conditions: [keyword('casa')] },
        { id: 'b', combinator: 'OR', conditions: [keyword('hoy')] },
      ],
    });

    expect(rulesFromDraft(all)).toEqual({
      mode: 'normal',
      rules: {
        combinator: 'AND',
        groups: [
          {
            combinator: 'AND',
            conditions: [{ field: 'keyword', op: 'contains', value: 'informe' }],
          },
        ],
      },
    });
    expect(rulesFromDraft(any).mode).toBe('advanced');
    expect(rulesFromDraft(any).rules.groups[0]?.combinator).toBe('OR');

    const savedAdvanced = rulesFromDraft(advanced);
    const loaded = draftFromSaved({
      name: advanced.name,
      color: null,
      mode: savedAdvanced.mode,
      rules: savedAdvanced.rules,
    });
    expect(loaded.advanced).toBe(true);
    expect(loaded.outer).toBe('OR');
    expect(rulesFromDraft(loaded).rules).toEqual(savedAdvanced.rules);

    const loadedAll = draftFromSaved({
      name: 'Casa · hoy',
      color: '#1F9D55',
      mode: 'normal',
      rules: rulesFromDraft(all).rules,
    });
    expect(loadedAll.match).toBe('all');
    expect(loadedAll.advanced).toBe(false);

    const loadedAny = draftFromSaved({
      name: 'Casa · hoy',
      color: null,
      mode: 'advanced',
      rules: rulesFromDraft(any).rules,
    });
    expect(loadedAny.match).toBe('any');
    expect(loadedAny.advanced).toBe(false);
  });

  it('drops incomplete rows and keeps several tag ids', () => {
    const row = keyword('   ');
    const tags: ConditionDraft = {
      ...keyword(''),
      field: 'tag',
      op: 'any_of',
      values: ['tag-casa', 'tag-alta'],
    };
    const next = draft({
      groups: [{ id: 'g', combinator: 'AND', conditions: [row, tags] }],
    });
    expect(rulesFromDraft(next).rules.groups[0]?.conditions).toEqual([
      { field: 'tag', op: 'any_of', value: ['tag-casa', 'tag-alta'] },
    ]);
    expect(incompleteIds(next)).toEqual([row.id]);
    expect(saveIssue(draft({ name: '  ', groups: next.groups }))).toBe('name');
    expect(saveIssue(draft({ groups: [{ id: 'g', combinator: 'AND', conditions: [row] }] }))).toBe(
      'empty',
    );
  });

  it('asks before a simple mode would drop groups', () => {
    const next = draft({
      advanced: true,
      groups: [
        { id: 'a', combinator: 'OR', conditions: [keyword('a')] },
        { id: 'b', combinator: 'AND', conditions: [keyword('b')] },
        { id: 'c', combinator: 'AND', conditions: [keyword('c')] },
      ],
    });
    expect(groupsToDrop(next)).toBe(2);
    const simple = simplifyDraft(next);
    expect(simple.advanced).toBe(false);
    expect(simple.match).toBe('any');
    expect(simple.groups).toHaveLength(1);
    expect(groupsToDrop(simple)).toBe(0);
  });
});
