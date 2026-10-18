export type StoredBoardView = 'list' | 'kanban' | 'timeline';

function keyFor(id: string): string {
  return `tick-tack-done.view.${id}`;
}

export function readStoredView(id: string): StoredBoardView | null {
  try {
    const value = localStorage.getItem(keyFor(id));
    if (value === 'kanban' || value === 'timeline' || value === 'list') {
      return value;
    }
  } catch {
    return null;
  }
  return null;
}

export function writeStoredView(id: string, view: StoredBoardView): void {
  try {
    localStorage.setItem(keyFor(id), view);
  } catch {
    // Private mode can reject storage. The URL still holds the choice for this visit.
  }
}
