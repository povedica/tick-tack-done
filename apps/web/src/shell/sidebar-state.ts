export const SIDEBAR_KEY = 'tick-tack-done.sidebar';

export function readSidebarCollapsed(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    return storage.getItem(SIDEBAR_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(storage: Pick<Storage, 'setItem'>, collapsed: boolean): void {
  storage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded');
}
