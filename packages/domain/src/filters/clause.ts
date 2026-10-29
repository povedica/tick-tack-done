import { isOverdue } from '../dates/schedule';
import { addCalendarDays, instantFromWall, wallClock, type WallClock } from '../dates/zoned';
import { isPriority } from '../priority/priority';
import type { DateFilterOp, FilterCondition, FilterGroup, FilterRules, Priority } from '../types';
import { partitionTagValues } from './tags';

/** Clock is injected. Relative dates are not resolved without it. */
export interface FilterClock {
  readonly now: string;
  readonly timeZone: string;
}

export interface FilterSubject {
  readonly listId: string | null;
  /** Absent means the caller did not load the list's folder. A folder condition then does not match. */
  readonly folderId?: string | null;
  readonly tagIds: readonly string[];
  readonly tagNames: readonly string[];
  readonly dueDate: string | null;
  readonly startDate?: string | null;
  readonly isAllDay: boolean;
  readonly timeZone: string;
  readonly priority: string;
  readonly title: string;
  readonly content: string;
  readonly status: string;
  readonly assigneeId: string | null;
  readonly deleted: boolean;
  readonly createdAt: string;
  readonly isSomeday?: boolean;
}

export type FilterClause =
  | { readonly op: 'and' | 'or'; readonly items: readonly FilterClause[] }
  | { readonly op: 'list_in'; readonly ids: readonly string[] }
  | { readonly op: 'folder_in'; readonly ids: readonly string[] }
  | {
      readonly op: 'tag_any';
      readonly ids: readonly string[];
      readonly legacyNames: readonly string[];
    }
  | { readonly op: 'due_range'; readonly from: string; readonly to: string }
  | { readonly op: 'no_date' }
  | { readonly op: 'overdue' }
  | { readonly op: 'priority_gte'; readonly minimum: Priority }
  | { readonly op: 'keyword'; readonly text: string }
  | { readonly op: 'status'; readonly status: 'active' | 'completed' }
  | { readonly op: 'assignee'; readonly id: string }
  | { readonly op: 'deleted'; readonly deleted: boolean }
  | { readonly op: 'exclude_status'; readonly status: 'archived' }
  | { readonly op: 'created_since'; readonly since: string }
  | { readonly op: 'never' }
  | { readonly op: 'always' }
  | { readonly op: 'someday'; readonly value: boolean };

const PRIORITY_RANK: Readonly<Record<Priority, number>> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

/** RF-904. One clause tree for in-memory evaluation and for the SQL plan. */
export function compileRules(rules: FilterRules, clock: FilterClock): FilterClause {
  return {
    op: rules.combinator === 'AND' ? 'and' : 'or',
    items: rules.groups.map((group) => compileGroup(group, clock)),
  };
}

/** Saved filters never surface trash or archived tasks unless a status condition says otherwise. */
export function savedFilterClause(rules: FilterRules, clock: FilterClock): FilterClause {
  const items: FilterClause[] = [
    compileRules(rules, clock),
    { op: 'deleted', deleted: false },
    notArchived(),
  ];
  if (!rulesMentionStatus(rules)) {
    items.push({ op: 'status', status: 'active' });
  }
  return { op: 'and', items };
}

function rulesMentionStatus(rules: FilterRules): boolean {
  return rules.groups.some((group) =>
    group.conditions.some((condition) => condition.field === 'status'),
  );
}

export function matchesFilter(
  rules: FilterRules,
  subject: FilterSubject,
  clock: FilterClock,
): boolean {
  return matchesClause(compileRules(rules, clock), subject, clock);
}

export function matchesClause(
  clause: FilterClause,
  subject: FilterSubject,
  clock: FilterClock,
): boolean {
  switch (clause.op) {
    case 'and':
      return clause.items.every((item) => matchesClause(item, subject, clock));
    case 'or':
      return clause.items.some((item) => matchesClause(item, subject, clock));
    case 'list_in':
      return subject.listId !== null && clause.ids.includes(subject.listId);
    case 'folder_in':
      return subject.folderId != null && clause.ids.includes(subject.folderId);
    case 'tag_any':
      return (
        idsOverlap(subject.tagIds, clause.ids) || overlaps(subject.tagNames, clause.legacyNames)
      );
    case 'due_range': {
      const effective = subject.startDate ?? subject.dueDate;
      return effective !== null && effective >= clause.from && effective < clause.to;
    }
    case 'no_date':
      return (subject.startDate ?? subject.dueDate) === null;
    case 'overdue':
      return isOverdue({
        status:
          subject.status === 'active' ||
          subject.status === 'archived' ||
          subject.status === 'cancelled'
            ? subject.status
            : 'completed',
        dueDate: subject.dueDate,
        startDate: subject.startDate,
        isAllDay: subject.isAllDay,
        timeZone: subject.timeZone,
        now: clock.now,
      });
    case 'priority_gte':
      return (
        isPriority(subject.priority) &&
        PRIORITY_RANK[subject.priority] >= PRIORITY_RANK[clause.minimum]
      );
    case 'keyword':
      return contains(subject.title, clause.text) || contains(subject.content, clause.text);
    case 'status':
      return subject.status === clause.status;
    case 'assignee':
      return subject.assigneeId === clause.id;
    case 'deleted':
      return subject.deleted === clause.deleted;
    case 'exclude_status':
      return subject.status !== clause.status;
    case 'created_since':
      return subject.createdAt >= clause.since;
    case 'never':
      return false;
    case 'always':
      return true;
    case 'someday':
      return (subject.isSomeday === true) === clause.value;
    default: {
      const unreachable: never = clause;
      return unreachable;
    }
  }
}

export function notArchived(): FilterClause {
  return { op: 'exclude_status', status: 'archived' };
}

export function localDayStart(iso: string, timeZone: string): string | null {
  const wall = wallClock(iso, timeZone);
  if (wall === null) {
    return null;
  }
  return instantFromWall(atMidnight(wall), timeZone);
}

export function shiftLocalDays(iso: string, timeZone: string, days: number): string | null {
  const wall = wallClock(iso, timeZone);
  if (wall === null) {
    return null;
  }
  return instantFromWall(addCalendarDays(atMidnight(wall), days), timeZone);
}

export function calendarDateKey(iso: string, timeZone: string): string {
  const wall = wallClock(iso, timeZone);
  if (wall === null) {
    return iso.slice(0, 10);
  }
  return `${String(wall.year)}-${pad(wall.month)}-${pad(wall.day)}`;
}

function compileGroup(group: FilterGroup, clock: FilterClock): FilterClause {
  return {
    op: group.combinator === 'AND' ? 'and' : 'or',
    items: group.conditions.map((condition) => compileCondition(condition, clock)),
  };
}

function compileCondition(condition: FilterCondition, clock: FilterClock): FilterClause {
  switch (condition.field) {
    case 'list':
      return condition.value.length === 0
        ? { op: 'never' }
        : { op: 'list_in', ids: condition.value };
    case 'folder':
      return condition.value.length === 0
        ? { op: 'never' }
        : { op: 'folder_in', ids: condition.value };
    case 'tag': {
      if (condition.value.length === 0) {
        return { op: 'never' };
      }
      const parts = partitionTagValues(condition.value);
      return { op: 'tag_any', ids: parts.ids, legacyNames: parts.legacyNames };
    }
    case 'date':
      return compileDate(condition, clock);
    case 'priority':
      return { op: 'priority_gte', minimum: condition.value };
    case 'keyword':
      return condition.value.length === 0
        ? { op: 'never' }
        : { op: 'keyword', text: condition.value };
    case 'status':
      return { op: 'status', status: condition.value };
    case 'assignee':
      return condition.value.length === 0
        ? { op: 'never' }
        : { op: 'assignee', id: condition.value };
    default: {
      const unreachable: never = condition;
      return unreachable;
    }
  }
}

function compileDate(
  condition: Extract<FilterCondition, { field: 'date' }>,
  clock: FilterClock,
): FilterClause {
  if (condition.op === 'no_date') {
    return { op: 'no_date' };
  }
  if (condition.op === 'overdue') {
    return { op: 'overdue' };
  }
  if (condition.op === 'between') {
    const from = calendarStart(condition.value[0], clock.timeZone);
    const to = calendarStart(nextCalendarDay(condition.value[1]), clock.timeZone);
    if (from === null || to === null) {
      return { op: 'never' };
    }
    return { op: 'due_range', from, to };
  }
  return relativeRange(condition.op, clock);
}

function relativeRange(
  op: Exclude<DateFilterOp, 'between' | 'no_date' | 'overdue'>,
  clock: FilterClock,
): FilterClause {
  const offset = op === 'tomorrow' ? 1 : 0;
  const length = op === 'next_7_days' ? 7 : 1;
  const from = shiftLocalDays(clock.now, clock.timeZone, offset);
  const to = shiftLocalDays(clock.now, clock.timeZone, offset + length);
  if (from === null || to === null) {
    return { op: 'never' };
  }
  return { op: 'due_range', from, to };
}

function calendarStart(day: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (match === null) {
    return null;
  }
  return instantFromWall(
    {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
}

function nextCalendarDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (match === null) {
    return day;
  }
  const shifted = addCalendarDays(
    {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: 0,
      minute: 0,
      second: 0,
    },
    1,
  );
  return `${String(shifted.year)}-${pad(shifted.month)}-${pad(shifted.day)}`;
}

function overlaps(left: readonly string[], right: readonly string[]): boolean {
  const wanted = new Set(right.map((name) => name.toLocaleLowerCase()));
  return left.some((name) => wanted.has(name.toLocaleLowerCase()));
}

function idsOverlap(left: readonly string[], right: readonly string[]): boolean {
  const wanted = new Set(right.map((id) => id.toLowerCase()));
  return left.some((id) => wanted.has(id.toLowerCase()));
}

function contains(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

function atMidnight(wall: WallClock): WallClock {
  return { ...wall, hour: 0, minute: 0, second: 0 };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
