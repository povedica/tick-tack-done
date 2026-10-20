import { describe, expect, it } from 'vitest';
import { matrixScopeParam, parseMatrixScope } from './scope';

describe('matrix scope', () => {
  it('defaults missing and unknown values to all', () => {
    expect(parseMatrixScope(null)).toEqual({ kind: 'all' });
    expect(parseMatrixScope('')).toEqual({ kind: 'all' });
    expect(parseMatrixScope('tags')).toEqual({ kind: 'all' });
    expect(parseMatrixScope('list/')).toEqual({ kind: 'all' });
  });

  it('reads today and a list id from the query', () => {
    expect(parseMatrixScope('today')).toEqual({ kind: 'today' });
    expect(parseMatrixScope('list/abc')).toEqual({ kind: 'list', listId: 'abc' });
  });

  it('round-trips a scope into the query param', () => {
    expect(matrixScopeParam({ kind: 'all' })).toBe('all');
    expect(matrixScopeParam({ kind: 'today' })).toBe('today');
    expect(matrixScopeParam({ kind: 'list', listId: 'abc' })).toBe('list/abc');
  });
});
