import { isPriority } from '../priority/priority';
import { isFilterTagId } from './tags';
import type {
  DateFilterOp,
  FilterCombinator,
  FilterCondition,
  FilterGroup,
  FilterMode,
  FilterRules,
} from '../types';

export type FilterParse =
  | { readonly ok: true; readonly rules: FilterRules }
  | { readonly ok: false; readonly reason: string };

const DATE_OPS: readonly DateFilterOp[] = [
  'today',
  'tomorrow',
  'next_7_days',
  'overdue',
  'no_date',
  'between',
];

/** RF-902. Normal mode is one AND group. Advanced mode is one level of AND/OR groups. */
export function parseFilterRules(value: unknown, mode: FilterMode): FilterParse {
  if (!isRecord(value)) {
    return fail('invalid_rules');
  }
  const combinator = parseCombinator(value.combinator);
  if (combinator === null || !Array.isArray(value.groups)) {
    return fail('invalid_rules');
  }
  const groups: FilterGroup[] = [];
  for (const group of value.groups) {
    const parsed = parseGroup(group);
    if (!parsed.ok) {
      return parsed;
    }
    groups.push(parsed.group);
  }
  if (mode === 'normal') {
    const shape = normalShape(combinator, groups);
    if (!shape.ok) {
      return shape;
    }
  }
  return { ok: true, rules: { combinator, groups } };
}

/** Rejects a saved filter with no conditions, or an advanced group that has none. */
export function requireConditions(
  rules: FilterRules,
): { readonly ok: true } | { readonly ok: false; readonly reason: 'empty_filter' | 'empty_group' } {
  const total = rules.groups.reduce((sum, group) => sum + group.conditions.length, 0);
  if (total === 0) {
    return { ok: false, reason: 'empty_filter' };
  }
  if (rules.groups.some((group) => group.conditions.length === 0)) {
    return { ok: false, reason: 'empty_group' };
  }
  return { ok: true };
}

function parseGroup(
  value: unknown,
): { ok: true; group: FilterGroup } | { ok: false; reason: string } {
  if (!isRecord(value)) {
    return fail('invalid_rules');
  }
  const combinator = parseCombinator(value.combinator);
  if (combinator === null || !Array.isArray(value.conditions)) {
    return fail('invalid_rules');
  }
  const conditions: FilterCondition[] = [];
  for (const condition of value.conditions) {
    const parsed = parseCondition(condition);
    if (!parsed.ok) {
      return parsed;
    }
    conditions.push(parsed.condition);
  }
  return { ok: true, group: { combinator, conditions } };
}

function parseCondition(
  value: unknown,
): { ok: true; condition: FilterCondition } | { ok: false; reason: string } {
  if (!isRecord(value) || typeof value.field !== 'string' || typeof value.op !== 'string') {
    return fail('invalid_condition');
  }
  switch (value.field) {
    case 'list':
      return value.op === 'in' ? stringList('list', 'in', value.value) : fail('invalid_condition');
    case 'folder':
      return value.op === 'in'
        ? stringList('folder', 'in', value.value)
        : fail('invalid_condition');
    case 'tag':
      return value.op === 'any_of'
        ? stringList('tag', 'any_of', value.value)
        : fail('invalid_condition');
    case 'date':
      return parseDate(value.op, value.value);
    case 'priority':
      return parsePriority(value.op, value.value);
    case 'keyword':
      return parseKeyword(value.op, value.value);
    case 'status':
      return parseStatus(value.op, value.value);
    case 'assignee':
      return parseAssignee(value.op, value.value);
    default:
      return fail('invalid_condition');
  }
}

function stringList(
  field: 'list' | 'tag' | 'folder',
  op: 'in' | 'any_of',
  value: unknown,
): { ok: true; condition: FilterCondition } | { ok: false; reason: string } {
  const items = stringArray(value);
  if (items === null || items.length === 0) {
    return fail('invalid_condition');
  }
  if (field === 'folder') {
    if (items.some((item) => !isFilterTagId(item))) {
      return fail('invalid_condition');
    }
    return { ok: true, condition: { field: 'folder', op: 'in', value: items } };
  }
  if (field === 'list') {
    return { ok: true, condition: { field: 'list', op: 'in', value: items } };
  }
  return { ok: true, condition: { field: 'tag', op: 'any_of', value: items } };
}

function parseDate(
  op: string,
  value: unknown,
): { ok: true; condition: FilterCondition } | { ok: false; reason: string } {
  if (!isDateOp(op)) {
    return fail('invalid_condition');
  }
  if (op === 'between') {
    const days = stringArray(value);
    const start = days?.[0];
    const end = days?.[1];
    if (days?.length !== 2 || start === undefined || end === undefined) {
      return fail('invalid_condition');
    }
    if (!isDay(start) || !isDay(end) || start > end) {
      return fail('invalid_condition');
    }
    return { ok: true, condition: { field: 'date', op, value: [start, end] } };
  }
  if (value !== undefined) {
    return fail('invalid_condition');
  }
  return { ok: true, condition: { field: 'date', op } };
}

function parsePriority(
  op: string,
  value: unknown,
): { ok: true; condition: FilterCondition } | { ok: false; reason: string } {
  if (op !== 'gte' || typeof value !== 'string' || !isPriority(value)) {
    return fail('invalid_condition');
  }
  return { ok: true, condition: { field: 'priority', op, value } };
}

function parseKeyword(
  op: string,
  value: unknown,
): { ok: true; condition: FilterCondition } | { ok: false; reason: string } {
  if (
    op !== 'contains' ||
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > 200
  ) {
    return fail('invalid_condition');
  }
  return { ok: true, condition: { field: 'keyword', op, value: value.trim() } };
}

function parseStatus(
  op: string,
  value: unknown,
): { ok: true; condition: FilterCondition } | { ok: false; reason: string } {
  if (op !== 'eq' || (value !== 'active' && value !== 'completed')) {
    return fail('invalid_condition');
  }
  return { ok: true, condition: { field: 'status', op, value } };
}

function parseAssignee(
  op: string,
  value: unknown,
): { ok: true; condition: FilterCondition } | { ok: false; reason: string } {
  if (op !== 'eq' || typeof value !== 'string' || value.trim().length === 0) {
    return fail('invalid_condition');
  }
  return { ok: true, condition: { field: 'assignee', op, value } };
}

function normalShape(
  combinator: FilterCombinator,
  groups: readonly FilterGroup[],
): { ok: true } | { ok: false; reason: string } {
  const group = groups[0];
  if (combinator !== 'AND' || groups.length !== 1 || group?.combinator !== 'AND') {
    return fail('normal_shape');
  }
  return { ok: true };
}

function parseCombinator(value: unknown): FilterCombinator | null {
  return value === 'AND' || value === 'OR' ? value : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.trim().length === 0) {
      return null;
    }
    items.push(item);
  }
  return items;
}

function isDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isDateOp(value: string): value is DateFilterOp {
  return DATE_OPS.some((op) => op === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}
