export type MatrixScope =
  | { readonly kind: 'all' }
  | { readonly kind: 'today' }
  | { readonly kind: 'list'; readonly listId: string };

/** `/matrix?scope=all|today|list/<id>`. Anything else falls back to the global matrix. */
export function parseMatrixScope(raw: string | null): MatrixScope {
  if (raw === 'today') {
    return { kind: 'today' };
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
  if (scope.kind === 'today') {
    return 'today';
  }
  if (scope.kind === 'list') {
    return `list/${scope.listId}`;
  }
  return 'all';
}

export function matrixScopeKey(scope: MatrixScope): string {
  return matrixScopeParam(scope);
}
