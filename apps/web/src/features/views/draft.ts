import type { FilterRules } from '@reflexionia/sdk';

export type ConditionField =
  'list' | 'folder' | 'tag' | 'date' | 'priority' | 'keyword' | 'status' | 'assignee';

export interface ConditionDraft {
  readonly id: string;
  readonly field: ConditionField;
  readonly op: string;
  readonly value: string;
  readonly valueTo: string;
  /** Tag and list ids. A single text value stays in `value`. */
  readonly values: readonly string[];
}

export interface GroupDraft {
  readonly id: string;
  readonly combinator: 'AND' | 'OR';
  readonly conditions: readonly ConditionDraft[];
}

export interface FilterDraft {
  readonly name: string;
  readonly color: string | null;
  readonly match: 'all' | 'any';
  readonly advanced: boolean;
  readonly outer: 'AND' | 'OR';
  readonly groups: readonly GroupDraft[];
}

export type FilterPreset = 'high' | 'no_date' | 'overdue';

type Condition = FilterRules['groups'][number]['conditions'][number];

const DATE_OPS = new Set(['today', 'tomorrow', 'next_7_days', 'overdue', 'no_date', 'between']);
const PRIORITIES = new Set(['none', 'low', 'medium', 'high']);

export function emptyCondition(field: ConditionField = 'keyword'): ConditionDraft {
  return {
    id: crypto.randomUUID(),
    field,
    op: defaultOp(field),
    value: field === 'priority' ? 'high' : field === 'status' ? 'active' : '',
    valueTo: '',
    values: [],
  };
}

export function blankDraft(preset?: FilterPreset): FilterDraft {
  const condition =
    preset === 'high'
      ? { ...emptyCondition('priority'), value: 'high' }
      : preset === 'no_date'
        ? { ...emptyCondition('date'), op: 'no_date' }
        : preset === 'overdue'
          ? { ...emptyCondition('date'), op: 'overdue' }
          : emptyCondition();
  return {
    name: '',
    color: null,
    match: 'all',
    advanced: false,
    outer: 'AND',
    groups: [{ id: crypto.randomUUID(), combinator: 'AND', conditions: [condition] }],
  };
}

export function draftFromSaved(input: {
  readonly name: string;
  readonly color: string | null;
  readonly mode: 'normal' | 'advanced';
  readonly rules: FilterRules;
}): FilterDraft {
  const groups = input.rules.groups.map((group) => ({
    id: crypto.randomUUID(),
    combinator: group.combinator,
    conditions:
      group.conditions.length === 0
        ? [emptyCondition()]
        : group.conditions.map((condition) => conditionToDraft(condition)),
  }));
  const filled = groups.length === 0 ? [emptyGroup('AND')] : groups;
  const single = filled.length === 1;
  const advanced = input.mode === 'advanced' && !single;
  const only = filled[0];
  const match: 'all' | 'any' =
    !advanced && input.mode === 'advanced' && only?.combinator === 'OR' ? 'any' : 'all';
  return {
    name: input.name,
    color: input.color,
    match,
    advanced,
    outer: input.rules.combinator === 'OR' ? 'OR' : 'AND',
    groups: filled,
  };
}

/** Todas, Alguna, or the advanced groups. Incomplete rows are omitted. */
export function rulesFromDraft(draft: FilterDraft): {
  readonly mode: 'normal' | 'advanced';
  readonly rules: FilterRules;
} {
  const groups = (draft.advanced ? draft.groups : draft.groups.slice(0, 1)).map((group) => ({
    combinator: draft.advanced ? group.combinator : draft.match === 'any' ? 'OR' : 'AND',
    conditions: group.conditions.flatMap((condition) => {
      const built = conditionFromDraft(condition);
      return built === null ? [] : [built];
    }),
  }));
  return {
    mode: !draft.advanced && draft.match === 'all' ? 'normal' : 'advanced',
    rules: {
      combinator: draft.advanced ? draft.outer : 'AND',
      groups: groups.length === 0 ? [{ combinator: 'AND', conditions: [] }] : groups,
    },
  };
}

export function isComplete(condition: ConditionDraft): boolean {
  switch (condition.field) {
    case 'keyword':
    case 'assignee':
      return condition.value.trim().length > 0;
    case 'list':
    case 'folder':
    case 'tag':
      return condition.values.length > 0;
    case 'date':
      if (condition.op === 'between') {
        return (
          condition.value.length > 0 &&
          condition.valueTo.length > 0 &&
          condition.value <= condition.valueTo
        );
      }
      return DATE_OPS.has(condition.op);
    case 'priority':
      return PRIORITIES.has(condition.value);
    case 'status':
      return condition.value === 'active' || condition.value === 'completed';
    default: {
      const unreachable: never = condition.field;
      return unreachable;
    }
  }
}

export function completeCount(draft: FilterDraft): number {
  return draft.groups.reduce(
    (total, group) => total + group.conditions.filter((condition) => isComplete(condition)).length,
    0,
  );
}

export function saveIssue(draft: FilterDraft): 'name' | 'empty' | null {
  const name = draft.name.trim();
  if (name.length === 0 || name.length > 80) {
    return 'name';
  }
  if (completeCount(draft) === 0) {
    return 'empty';
  }
  return null;
}

export function incompleteIds(draft: FilterDraft): readonly string[] {
  return draft.groups.flatMap((group) =>
    group.conditions.filter((condition) => !isComplete(condition)).map((condition) => condition.id),
  );
}

/** Groups that disappear when leaving advanced mode. */
export function groupsToDrop(draft: FilterDraft): number {
  if (!draft.advanced || draft.groups.length <= 1) {
    return 0;
  }
  return draft.groups.length - 1;
}

export function simplifyDraft(draft: FilterDraft): FilterDraft {
  const first = draft.groups[0] ?? emptyGroup('AND');
  return {
    ...draft,
    advanced: false,
    match: first.combinator === 'OR' ? 'any' : 'all',
    outer: 'AND',
    groups: [first],
  };
}

export function emptyGroup(combinator: 'AND' | 'OR'): GroupDraft {
  return { id: crypto.randomUUID(), combinator, conditions: [emptyCondition()] };
}

function defaultOp(field: ConditionField): string {
  switch (field) {
    case 'keyword':
      return 'contains';
    case 'list':
    case 'folder':
      return 'in';
    case 'tag':
      return 'any_of';
    case 'date':
      return 'today';
    case 'priority':
      return 'gte';
    case 'status':
    case 'assignee':
      return 'eq';
    default: {
      const unreachable: never = field;
      return unreachable;
    }
  }
}

function conditionToDraft(condition: Condition): ConditionDraft {
  const values = texts(condition.value);
  const base = emptyCondition(isField(condition.field) ? condition.field : 'keyword');
  switch (condition.field) {
    case 'list':
      return { ...base, field: 'list', op: 'in', values };
    case 'folder':
      return { ...base, field: 'folder', op: 'in', values };
    case 'tag':
      return { ...base, field: 'tag', op: 'any_of', values };
    case 'date':
      return condition.op === 'between'
        ? {
            ...base,
            field: 'date',
            op: 'between',
            value: values[0] ?? '',
            valueTo: values[1] ?? '',
          }
        : { ...base, field: 'date', op: condition.op };
    case 'priority':
      return { ...base, field: 'priority', op: 'gte', value: values[0] ?? '' };
    case 'status':
      return { ...base, field: 'status', op: 'eq', value: values[0] ?? '' };
    case 'assignee':
      return { ...base, field: 'assignee', op: 'eq', value: values[0] ?? '' };
    case 'keyword':
      return { ...base, field: 'keyword', op: 'contains', value: values[0] ?? '' };
    default:
      return { ...base, value: values[0] ?? '' };
  }
}

function conditionFromDraft(draft: ConditionDraft): Condition | null {
  if (!isComplete(draft)) {
    return null;
  }
  switch (draft.field) {
    case 'list':
      return { field: 'list', op: 'in', value: [...draft.values] };
    case 'folder':
      return { field: 'folder', op: 'in', value: [...draft.values] };
    case 'tag':
      return { field: 'tag', op: 'any_of', value: [...draft.values] };
    case 'date':
      if (draft.op === 'between') {
        return { field: 'date', op: 'between', value: [draft.value, draft.valueTo] };
      }
      return { field: 'date', op: draft.op };
    case 'priority':
      return { field: 'priority', op: 'gte', value: draft.value };
    case 'keyword':
      return { field: 'keyword', op: 'contains', value: draft.value.trim() };
    case 'status':
      return { field: 'status', op: 'eq', value: draft.value };
    case 'assignee':
      return { field: 'assignee', op: 'eq', value: draft.value.trim() };
    default: {
      const unreachable: never = draft.field;
      return unreachable;
    }
  }
}

function texts(value: Condition['value']): string[] {
  if (Array.isArray(value)) {
    return value.filter((item) => item.length > 0);
  }
  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

function isField(value: string): value is ConditionField {
  return (
    value === 'list' ||
    value === 'folder' ||
    value === 'tag' ||
    value === 'date' ||
    value === 'priority' ||
    value === 'keyword' ||
    value === 'status' ||
    value === 'assignee'
  );
}
