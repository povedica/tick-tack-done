const LEGACY_ORDER = [
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
] as const;

/** §4.5. Assigned to me stays in settings (V2) and out of the sidebar. Trash is pinned in the footer. */
export const SIDEBAR_SMART_ORDER = [
  'today',
  'tomorrow',
  'next_7_days',
  'all',
  'inbox',
  'no_date',
  'recently_added',
  'completed',
] as const;

const SPEC_ORDER = [...SIDEBAR_SMART_ORDER, 'assigned_to_me', 'trash'] as const;

export interface SmartListRow {
  readonly key: string;
  readonly sort_order: string;
}

export function orderedSmartLists<T extends SmartListRow>(items: readonly T[]): T[] {
  const numeric = [...items].sort((left, right) => compareSort(left.sort_order, right.sort_order));
  const keys = numeric.map((item) => item.key);
  const legacy =
    keys.length === LEGACY_ORDER.length && keys.every((key, index) => key === LEGACY_ORDER[index]);
  const wanted = legacy ? SPEC_ORDER : keys;
  const byKey = new Map(items.map((item) => [item.key, item]));
  return wanted.flatMap((key) => {
    const item = byKey.get(key);
    return item === undefined ? [] : [item];
  });
}

function compareSort(left: string, right: string): number {
  try {
    const a = BigInt(left);
    const b = BigInt(right);
    return a < b ? -1 : a > b ? 1 : 0;
  } catch {
    return left.localeCompare(right);
  }
}
