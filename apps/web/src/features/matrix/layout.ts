const PREFIX = 'tick-tack-done.matrix.view.';

export type MatrixLayout = 'list' | 'matrix';

export function matrixLayoutStorageKey(scopeKey: string): string {
  return `${PREFIX}${scopeKey}`;
}

export function readMatrixLayout(scopeKey: string): MatrixLayout {
  if (typeof localStorage === 'undefined') {
    return 'list';
  }
  return localStorage.getItem(matrixLayoutStorageKey(scopeKey)) === 'matrix' ? 'matrix' : 'list';
}

export function writeMatrixLayout(scopeKey: string, layout: MatrixLayout): void {
  localStorage.setItem(matrixLayoutStorageKey(scopeKey), layout);
}
