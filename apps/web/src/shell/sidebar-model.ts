import type { SidebarLink } from './navigation';

/** Smart-list keys the sidebar knows how to label. `assigned_to_me` is V2. */
const SMART_LABELS: Record<string, SidebarLink['labelKey']> = {
  today: 'navToday',
  tomorrow: 'navTomorrow',
  next_7_days: 'navNext7',
  all: 'navAll',
  inbox: 'navInbox',
  no_date: 'navNoDate',
  recently_added: 'navRecent',
  completed: 'navCompleted',
  trash: 'navTrash',
};

/** Slugs from the first shell that do not match the API key. */
const SMART_ALIASES: Record<string, string> = {
  next7: 'next_7_days',
  'no-date': 'no_date',
  recent: 'recently_added',
};

export interface SmartListRow {
  readonly key: string;
  readonly enabled: boolean;
  readonly sortOrder: string;
  readonly taskCount: number;
}

export interface SidebarSmartLink {
  readonly key: string;
  readonly to: string;
  readonly labelKey: SidebarLink['labelKey'];
  readonly count: number;
  readonly separated: boolean;
}

export interface ProjectRow {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  readonly kind: 'TASK' | 'NOTE';
  readonly closed: boolean;
  readonly isInbox: boolean;
  readonly sortOrder: string;
  readonly activeTaskCount: number;
}

export interface SidebarProject {
  readonly id: string;
  readonly name: string;
  readonly to: string;
  readonly color: string | null;
  readonly count: number;
}

export interface FilterRow {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  readonly sortOrder: string;
  readonly taskCount: number;
}

export interface SidebarFilter {
  readonly id: string;
  readonly name: string;
  readonly to: string;
  readonly color: string | null;
  readonly count: number;
}

export function canonicalSmartKey(key: string): string {
  return SMART_ALIASES[key] ?? key;
}

export function smartListHref(key: string): string {
  if (key === 'today') {
    return '/today';
  }
  if (key === 'inbox') {
    return '/inbox';
  }
  return `/smart/${key}`;
}

/** Enabled smart lists in stored order, with the trash link last. */
export function visibleSmartLists(rows: readonly SmartListRow[]): SidebarSmartLink[] {
  const enabled = rows.filter((row) => row.enabled && SMART_LABELS[row.key] !== undefined);
  const rest = enabled.filter((row) => row.key !== 'trash').sort(bySortOrder);
  const trash = enabled.filter((row) => row.key === 'trash').sort(bySortOrder);
  return [...rest, ...trash].map((row, index) => ({
    key: row.key,
    to: smartListHref(row.key),
    labelKey: SMART_LABELS[row.key] ?? 'navAll',
    count: row.taskCount,
    separated: row.key === 'trash' && index > 0,
  }));
}

/** Task lists only. Inbox is already a smart list; notes stay out of this cut. */
export function visibleProjects(rows: readonly ProjectRow[]): SidebarProject[] {
  return rows
    .filter((row) => row.kind === 'TASK' && !row.closed && !row.isInbox)
    .sort(bySortOrder)
    .map((row) => ({
      id: row.id,
      name: row.name,
      to: `/list/${row.id}`,
      color: safeColor(row.color),
      count: row.activeTaskCount,
    }));
}

/**
 * Saved filters, in pin order. The API has no pinned flag: pinning moves
 * `sort_order` to the front, and every saved filter is a sidebar entry.
 */
export function visibleFilters(rows: readonly FilterRow[]): SidebarFilter[] {
  return [...rows].sort(bySortOrder).map((row) => ({
    id: row.id,
    name: row.name,
    to: `/filter/${row.id}`,
    color: safeColor(row.color),
    count: row.taskCount,
  }));
}

export function safeColor(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

function bySortOrder<T extends { readonly sortOrder: string }>(left: T, right: T): number {
  try {
    const a = BigInt(left.sortOrder);
    const b = BigInt(right.sortOrder);
    if (a < b) {
      return -1;
    }
    if (a > b) {
      return 1;
    }
  } catch {
    return left.sortOrder.localeCompare(right.sortOrder);
  }
  return 0;
}
