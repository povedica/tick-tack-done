import { comparePriority, isPriority } from '../priority/priority';
import type { Priority } from '../types';
import { calendarDateKey } from './clause';

export type TaskGroupBy = 'none' | 'section' | 'date' | 'tag' | 'priority';
export type TaskSort = 'manual' | 'date' | 'priority' | 'title' | 'created';

export interface ArrangedTask {
  readonly id: string;
  readonly title: string;
  readonly dueDate: string | null;
  readonly priority: string;
  readonly sortOrder: string;
  readonly createdAt: string;
  readonly columnId: string | null;
  readonly columnName: string | null;
  readonly columnSortOrder: string | null;
  readonly tagNames: readonly string[];
}

export interface TaskGroup<T> {
  readonly key: string;
  readonly label: string;
  readonly tasks: readonly T[];
}

export interface TaskViewOptions {
  readonly groupBy: TaskGroupBy;
  readonly sort: TaskSort;
  readonly timeZone: string;
}

const GROUP_BY: readonly TaskGroupBy[] = ['none', 'section', 'date', 'tag', 'priority'];
const SORTS: readonly TaskSort[] = ['manual', 'date', 'priority', 'title', 'created'];
const PRIORITY_ORDER: readonly Priority[] = ['high', 'medium', 'low', 'none'];

/** RF-1001. Grouping and ordering happen once, on the server. */
export function arrangeTasks<T extends ArrangedTask>(
  tasks: readonly T[],
  options: TaskViewOptions,
): TaskGroup<T>[] {
  const sorted = [...tasks].sort((left, right) => compareTasks(left, right, options.sort));
  switch (options.groupBy) {
    case 'none':
      return sorted.length === 0 ? [] : [{ key: 'all', label: 'all', tasks: sorted }];
    case 'section':
      return sectionGroups(sorted);
    case 'date':
      return dateGroups(sorted, options.timeZone);
    case 'tag':
      return tagGroups(sorted);
    case 'priority':
      return priorityGroups(sorted);
    default: {
      const unreachable: never = options.groupBy;
      return unreachable;
    }
  }
}

export function parseTaskView(
  groupBy: string | undefined,
  sort: string | undefined,
): { ok: true; groupBy: TaskGroupBy; sort: TaskSort } | { ok: false; reason: 'invalid_view' } {
  const group = groupBy === undefined || groupBy.length === 0 ? 'none' : groupBy;
  const order = sort === undefined || sort.length === 0 ? 'manual' : sort;
  if (!isGroupBy(group) || !isSort(order)) {
    return { ok: false, reason: 'invalid_view' };
  }
  return { ok: true, groupBy: group, sort: order };
}

export function pageTaskGroups<T extends { id: string }>(
  groups: readonly TaskGroup<T>[],
  limit: number,
  cursor: { index: number; id: string } | null,
): { groups: TaskGroup<T>[]; total: number; next: { index: number; id: string } | null } {
  const flat = groups.flatMap((group) =>
    group.tasks.map((task) => ({ key: group.key, label: group.label, task })),
  );
  let start = 0;
  if (cursor !== null) {
    const at = flat[cursor.index];
    if (at?.task.id === cursor.id) {
      start = cursor.index + 1;
    }
  }
  const slice = flat.slice(start, start + limit);
  const last = slice.at(-1);
  const next =
    last !== undefined && start + slice.length < flat.length
      ? { index: start + slice.length - 1, id: last.task.id }
      : null;
  return { groups: regroup(slice), total: flat.length, next };
}

function sectionGroups<T extends ArrangedTask>(tasks: readonly T[]): TaskGroup<T>[] {
  const buckets = new Map<string, { label: string; sort: string | null; tasks: T[] }>();
  for (const task of tasks) {
    const key = task.columnId ?? 'none';
    const current = buckets.get(key);
    if (current === undefined) {
      buckets.set(key, {
        label: task.columnName ?? 'none',
        sort: task.columnSortOrder,
        tasks: [task],
      });
    } else {
      current.tasks.push(task);
    }
  }
  return [...buckets.entries()]
    .sort((left, right) => compareSection(left[1].sort, left[0], right[1].sort, right[0]))
    .map(([key, bucket]) => ({ key, label: bucket.label, tasks: bucket.tasks }));
}

function dateGroups<T extends ArrangedTask>(tasks: readonly T[], timeZone: string): TaskGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const task of tasks) {
    const key = task.dueDate === null ? 'none' : calendarDateKey(task.dueDate, timeZone);
    const current = buckets.get(key) ?? [];
    current.push(task);
    buckets.set(key, current);
  }
  return [...buckets.entries()]
    .sort((left, right) => compareNamed(left[0], right[0]))
    .map(([key, grouped]) => ({ key, label: key, tasks: grouped }));
}

function tagGroups<T extends ArrangedTask>(tasks: readonly T[]): TaskGroup<T>[] {
  const buckets = new Map<string, { label: string; tasks: T[] }>();
  for (const task of tasks) {
    const names = uniqueTags(task.tagNames);
    const keys = names.length === 0 ? ['none'] : names;
    for (const name of keys) {
      const key = name === 'none' ? 'none' : name.toLocaleLowerCase();
      const current = buckets.get(key);
      if (current === undefined) {
        buckets.set(key, { label: name === 'none' ? 'none' : name, tasks: [task] });
      } else {
        current.tasks.push(task);
      }
    }
  }
  return [...buckets.entries()]
    .sort((left, right) => compareNamed(left[1].label, right[1].label))
    .map(([key, bucket]) => ({ key, label: bucket.label, tasks: bucket.tasks }));
}

function priorityGroups<T extends ArrangedTask>(tasks: readonly T[]): TaskGroup<T>[] {
  return PRIORITY_ORDER.flatMap((priority) => {
    const grouped = tasks.filter((task) => task.priority === priority);
    return grouped.length === 0 ? [] : [{ key: priority, label: priority, tasks: grouped }];
  });
}

function compareTasks(left: ArrangedTask, right: ArrangedTask, sort: TaskSort): number {
  const primary = primaryCompare(left, right, sort);
  if (primary !== 0) {
    return primary;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function primaryCompare(left: ArrangedTask, right: ArrangedTask, sort: TaskSort): number {
  switch (sort) {
    case 'manual':
      return compareBig(left.sortOrder, right.sortOrder);
    case 'date':
      return compareDue(left.dueDate, right.dueDate);
    case 'priority':
      return compareKnownPriority(left.priority, right.priority);
    case 'title':
      return left.title.localeCompare(right.title, 'es', { sensitivity: 'accent' });
    case 'created':
      return right.createdAt < left.createdAt ? -1 : right.createdAt > left.createdAt ? 1 : 0;
    default: {
      const unreachable: never = sort;
      return unreachable;
    }
  }
}

function compareDue(left: string | null, right: string | null): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareKnownPriority(left: string, right: string): number {
  if (!isPriority(left) || !isPriority(right)) {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  return comparePriority(left, right);
}

function compareBig(left: string, right: string): number {
  try {
    const a = BigInt(left);
    const b = BigInt(right);
    if (a < b) {
      return -1;
    }
    if (a > b) {
      return 1;
    }
    return 0;
  } catch {
    return left < right ? -1 : left > right ? 1 : 0;
  }
}

function compareSection(
  leftSort: string | null,
  leftKey: string,
  rightSort: string | null,
  rightKey: string,
): number {
  if (leftKey === 'none') {
    return 1;
  }
  if (rightKey === 'none') {
    return -1;
  }
  const order = compareBig(leftSort ?? '0', rightSort ?? '0');
  return order === 0 ? leftKey.localeCompare(rightKey) : order;
}

function compareNamed(left: string, right: string): number {
  if (left === 'none') {
    return 1;
  }
  if (right === 'none') {
    return -1;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueTags(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const key = name.toLocaleLowerCase();
    if (key.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(name);
  }
  return result;
}

function regroup<T extends { id: string }>(
  slice: readonly { key: string; label: string; task: T }[],
): TaskGroup<T>[] {
  const groups: TaskGroup<T>[] = [];
  for (const item of slice) {
    const last = groups.at(-1);
    if (last?.key === item.key) {
      groups[groups.length - 1] = { ...last, tasks: [...last.tasks, item.task] };
    } else {
      groups.push({ key: item.key, label: item.label, tasks: [item.task] });
    }
  }
  return groups;
}

function isGroupBy(value: string): value is TaskGroupBy {
  return GROUP_BY.some((item) => item === value);
}

function isSort(value: string): value is TaskSort {
  return SORTS.some((item) => item === value);
}
