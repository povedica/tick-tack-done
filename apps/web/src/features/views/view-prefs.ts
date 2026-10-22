export type StoredBoardView = 'list' | 'kanban' | 'timeline';
export type ViewGroupBy = 'none' | 'section' | 'date' | 'tag' | 'priority';
export type ViewSort = 'manual' | 'date' | 'priority' | 'title' | 'created';
export type ViewSortOrder = 'asc' | 'desc';
export type DetailLayout = 'side' | 'popup';

export interface ViewPrefs {
  readonly view: StoredBoardView;
  readonly group: ViewGroupBy;
  readonly sort: ViewSort;
  readonly order: ViewSortOrder;
  readonly showDetails: boolean;
  readonly hideCompleted: boolean;
  readonly detailLayout: DetailLayout;
  readonly syncAcrossDevices: boolean;
}

export const DEFAULT_VIEW_PREFS: ViewPrefs = {
  view: 'list',
  group: 'none',
  sort: 'manual',
  order: 'asc',
  showDetails: true,
  hideCompleted: true,
  detailLayout: 'side',
  syncAcrossDevices: true,
};

function keyFor(id: string): string {
  return `tick-tack-done.view-prefs.${id}`;
}

function legacyViewKey(id: string): string {
  return `tick-tack-done.view.${id}`;
}

function asView(value: unknown): StoredBoardView | null {
  return value === 'kanban' || value === 'timeline' || value === 'list' ? value : null;
}

function asGroup(value: unknown): ViewGroupBy | null {
  return value === 'none' ||
    value === 'section' ||
    value === 'date' ||
    value === 'tag' ||
    value === 'priority'
    ? value
    : null;
}

function asSort(value: unknown): ViewSort | null {
  return value === 'manual' ||
    value === 'date' ||
    value === 'priority' ||
    value === 'title' ||
    value === 'created'
    ? value
    : null;
}

function asOrder(value: unknown): ViewSortOrder | null {
  return value === 'asc' || value === 'desc' ? value : null;
}

function asLayout(value: unknown): DetailLayout | null {
  return value === 'side' || value === 'popup' ? value : null;
}

/** TTD-AUD-59: read per-view prefs (local cache backed by the account API). */
export function readViewPrefs(id: string, fallback: Partial<ViewPrefs> = {}): ViewPrefs {
  const base: ViewPrefs = { ...DEFAULT_VIEW_PREFS, ...fallback };
  try {
    const raw = localStorage.getItem(keyFor(id));
    if (raw !== null) {
      const row = JSON.parse(raw) as Record<string, unknown>;
      return {
        view: asView(row.view) ?? base.view,
        group: asGroup(row.group) ?? base.group,
        sort: asSort(row.sort) ?? base.sort,
        order: asOrder(row.order) ?? base.order,
        showDetails: typeof row.showDetails === 'boolean' ? row.showDetails : base.showDetails,
        hideCompleted:
          typeof row.hideCompleted === 'boolean' ? row.hideCompleted : base.hideCompleted,
        detailLayout: asLayout(row.detailLayout) ?? base.detailLayout,
        syncAcrossDevices:
          typeof row.syncAcrossDevices === 'boolean'
            ? row.syncAcrossDevices
            : base.syncAcrossDevices,
      };
    }
    const legacy = asView(localStorage.getItem(legacyViewKey(id)));
    if (legacy !== null) {
      return { ...base, view: legacy };
    }
  } catch {
    return base;
  }
  return base;
}

export function writeViewPrefs(id: string, prefs: ViewPrefs): void {
  try {
    localStorage.setItem(keyFor(id), JSON.stringify(prefs));
    localStorage.setItem(legacyViewKey(id), prefs.view);
  } catch {
    // Private mode can reject storage.
  }
}

export function patchViewPrefs(id: string, patch: Partial<ViewPrefs>): ViewPrefs {
  const next = { ...readViewPrefs(id), ...patch };
  writeViewPrefs(id, next);
  return next;
}

/** @deprecated use readViewPrefs */
export function readStoredView(id: string): StoredBoardView | null {
  return readViewPrefs(id).view;
}

/** @deprecated use writeViewPrefs / patchViewPrefs */
export function writeStoredView(id: string, view: StoredBoardView): void {
  patchViewPrefs(id, { view });
}
