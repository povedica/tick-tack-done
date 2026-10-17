import type { FilterRules } from '@reflexionia/sdk';

export type ConditionField =
  | 'list'
  | 'tag'
  | 'date'
  | 'priority'
  | 'keyword'
  | 'status'
  | 'assignee';

export interface ConditionDraft {
  readonly field: ConditionField;
  readonly op: string;
  readonly value: string;
  readonly valueTo: string;
}

export interface GroupDraft {
  readonly combinator: 'AND' | 'OR';
  readonly conditions: readonly ConditionDraft[];
}

export const EMPTY_CONDITION: ConditionDraft = {
  field: 'keyword',
  op: 'contains',
  value: '',
  valueTo: '',
};

/** RF-902. Incomplete rows are left out so a blank preview still matches the grammar. */
export function rulesFromDraft(
  mode: 'normal' | 'advanced',
  groups: readonly GroupDraft[],
): FilterRules {
  const usable = groups.map((group) => ({
    combinator: mode === 'normal' ? ('AND' as const) : group.combinator,
    conditions: group.conditions.flatMap((condition) => {
      const built = conditionFromDraft(condition);
      return built === null ? [] : [built];
    }),
  }));
  const selected = mode === 'normal' ? usable.slice(0, 1) : usable;
  return {
    combinator: 'AND',
    groups:
      selected.length === 0
        ? [{ combinator: 'AND', conditions: [] }]
        : selected.map((group) => ({
            combinator: group.combinator,
            conditions: group.conditions,
          })),
  };
}

export function rulesWithOuter(
  mode: 'normal' | 'advanced',
  outer: 'AND' | 'OR',
  groups: readonly GroupDraft[],
): FilterRules {
  const rules = rulesFromDraft(mode, groups);
  if (mode === 'normal') {
    return rules;
  }
  return { ...rules, combinator: outer };
}

function conditionFromDraft(
  draft: ConditionDraft,
): FilterRules['groups'][number]['conditions'][number] | null {
  switch (draft.field) {
    case 'list':
      return draft.value.length === 0 ? null : { field: 'list', op: 'in', value: [draft.value] };
    case 'tag':
      return draft.value.trim().length === 0
        ? null
        : { field: 'tag', op: 'any_of', value: [draft.value.trim()] };
    case 'date':
      if (draft.op === 'between') {
        if (draft.value.length === 0 || draft.valueTo.length === 0 || draft.value > draft.valueTo) {
          return null;
        }
        return { field: 'date', op: 'between', value: [draft.value, draft.valueTo] };
      }
      if (
        draft.op === 'today' ||
        draft.op === 'tomorrow' ||
        draft.op === 'next_7_days' ||
        draft.op === 'overdue' ||
        draft.op === 'no_date'
      ) {
        return { field: 'date', op: draft.op };
      }
      return null;
    case 'priority':
      if (
        draft.value !== 'none' &&
        draft.value !== 'low' &&
        draft.value !== 'medium' &&
        draft.value !== 'high'
      ) {
        return null;
      }
      return { field: 'priority', op: 'gte', value: draft.value };
    case 'keyword':
      return draft.value.trim().length === 0
        ? null
        : { field: 'keyword', op: 'contains', value: draft.value.trim() };
    case 'status':
      return draft.value === 'active' || draft.value === 'completed'
        ? { field: 'status', op: 'eq', value: draft.value }
        : null;
    case 'assignee':
      return draft.value.trim().length === 0
        ? null
        : { field: 'assignee', op: 'eq', value: draft.value.trim() };
    default: {
      const unreachable: never = draft.field;
      return unreachable;
    }
  }
}
