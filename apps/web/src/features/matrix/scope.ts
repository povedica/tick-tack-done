export type MatrixScope =
  | { readonly kind: 'all' }
  | { readonly kind: 'today' }
  | { readonly kind: 'tomorrow' }
  | { readonly kind: 'list'; readonly listId: string };

/** `/matrix?scope=all|today|tomorrow|list/<id>`. Anything else falls back to the global matrix. */
export function parseMatrixScope(raw: string | null): MatrixScope {
  if (raw === 'today' || raw === 'tomorrow') {
    return { kind: raw };
  }
  if (raw?.startsWith('list/') === true) {
    const listId = raw.slice('list/'.length);
    if (listId.length > 0) {
      return { kind: 'list', listId };
    }
  }
  return { kind: 'all' };
}

export function matrixScopeParam(scope: MatrixScope): string {
  if (scope.kind === 'today' || scope.kind === 'tomorrow') {
    return scope.kind;
  }
  if (scope.kind === 'list') {
    return `list/${scope.listId}`;
  }
  return 'all';
}

export function matrixScopeKey(scope: MatrixScope): string {
  return matrixScopeParam(scope);
}
