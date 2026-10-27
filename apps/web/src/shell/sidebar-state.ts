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

function folderKey(id: string): string {
  return `ttd.sidebar.folder.${id}`;
}

/** Folders start open. A stored `closed` value keeps one folder folded. */
export function readFolderOpen(
  id: string,
  storage: Pick<Storage, 'getItem'> = localStorage,
): boolean {
  try {
    return storage.getItem(folderKey(id)) !== 'closed';
  } catch {
    return true;
  }
}

export function writeFolderOpen(
  id: string,
  open: boolean,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  storage.setItem(folderKey(id), open ? 'open' : 'closed');
}
