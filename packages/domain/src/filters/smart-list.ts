import type { FilterCondition, FilterRules, SmartListKey } from '../types';
import {
  compileRules,
  matchesClause,
  notArchived,
  shiftLocalDays,
  type FilterClause,
  type FilterClock,
  type FilterSubject,
} from './clause';

export const SMART_LIST_KEYS = [
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
  'someday',
] as const satisfies readonly SmartListKey[];

/** RF-901: core navigation stays visible; optional footer/assignment views retain visibility preferences. */
export const FIXED_SMART_LIST_KEYS: readonly string[] = [
  'today',
  'tomorrow',
  'next_7_days',
  'all',
  'inbox',
  'no_date',
  'recently_added',
  'someday',
];

/** Tasks created on the local day this many days ago still count as recently added. */
export const RECENT_WINDOW_DAYS = 30;

export interface SmartListInput {
  readonly clock: FilterClock;
  readonly inboxProjectId: string | null;
  readonly assigneeId: string;
}

/** RF-901. System lists are the same grammar as a saved filter, plus trash and recency. */
export function smartListClause(key: SmartListKey, input: SmartListInput): FilterClause {
  if (key === 'today') {
    return {
      op: 'and',
      items: [
        {
          op: 'or',
          items: [compileRules(and(date('today'), active()), input.clock), { op: 'overdue' }],
        },
        { op: 'deleted', deleted: false },
        notArchived(),
        { op: 'someday', value: false },
      ],
    };
  }
  if (key === 'someday') {
    return {
      op: 'and',
      items: [
        { op: 'someday', value: true },
        { op: 'status', status: 'active' },
        { op: 'deleted', deleted: false },
        notArchived(),
      ],
    };
  }
  const items: FilterClause[] = [compileRules(rulesFor(key, input), input.clock)];
  if (key === 'trash') {
    items.push({ op: 'deleted', deleted: true });
  } else {
    items.push({ op: 'deleted', deleted: false }, notArchived());
  }
  if (key === 'tomorrow' || key === 'next_7_days' || key === 'no_date') {
    items.push({ op: 'someday', value: false });
  }
  if (key === 'recently_added') {
    const since = shiftLocalDays(input.clock.now, input.clock.timeZone, -RECENT_WINDOW_DAYS);
    items.push(since === null ? { op: 'never' } : { op: 'created_since', since });
  }
  return { op: 'and', items };
}

export function matchesSmartList(
  key: SmartListKey,
  subject: FilterSubject,
  input: SmartListInput,
): boolean {
  return matchesClause(smartListClause(key, input), subject, input.clock);
}

export function isSmartListKey(value: string): value is SmartListKey {
  return SMART_LIST_KEYS.some((key) => key === value);
}

function rulesFor(key: SmartListKey, input: SmartListInput): FilterRules {
  switch (key) {
    case 'today':
      return and(date('today'), active());
    case 'tomorrow':
      return and(date('tomorrow'), active());
    case 'next_7_days':
      return and(date('next_7_days'), active());
    case 'all':
      return and(active());
    case 'inbox':
      return and(listIn(input.inboxProjectId), active());
    case 'assigned_to_me':
      return and(assignee(input.assigneeId), active());
    case 'completed':
      return and(completed());
    case 'trash':
      return { combinator: 'AND', groups: [{ combinator: 'AND', conditions: [] }] };
    case 'recently_added':
      return and(active());
    case 'no_date':
      return and(date('no_date'), active());
    case 'someday':
      return and(active());
    default: {
      const unreachable: never = key;
      return unreachable;
    }
  }
}

function and(...conditions: FilterCondition[]): FilterRules {
  return { combinator: 'AND', groups: [{ combinator: 'AND', conditions }] };
}

function date(op: 'today' | 'tomorrow' | 'next_7_days' | 'no_date'): FilterCondition {
  return { field: 'date', op };
}

function active(): FilterCondition {
  return { field: 'status', op: 'eq', value: 'active' };
}

function completed(): FilterCondition {
  return { field: 'status', op: 'eq', value: 'completed' };
}

function listIn(id: string | null): FilterCondition {
  return { field: 'list', op: 'in', value: id === null || id.length === 0 ? [] : [id] };
}

function assignee(id: string): FilterCondition {
  return { field: 'assignee', op: 'eq', value: id };
}
