const PREFIX = 'tick-tack-done.matrix.view.';

export type MatrixLayout = 'list' | 'matrix' | 'kanban';

export function matrixLayoutStorageKey(scopeKey: string): string {
  return `${PREFIX}${scopeKey}`;
}

export function readMatrixLayout(scopeKey: string): MatrixLayout {
  if (typeof localStorage === 'undefined') {
    return 'list';
  }
  const value = localStorage.getItem(matrixLayoutStorageKey(scopeKey));
  return value === 'matrix' || value === 'kanban' ? value : 'list';
}

export function writeMatrixLayout(scopeKey: string, layout: MatrixLayout): void {
  localStorage.setItem(matrixLayoutStorageKey(scopeKey), layout);
}
