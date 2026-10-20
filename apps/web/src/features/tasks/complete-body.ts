/** REC-1/REC-2: UI completes jump to the next future due and materialize immediately. */
export const SERIES_COMPLETE_BODY = {
  advance: 'next_future' as const,
  materialize_next: true as const,
};

export function completeBody(extra: { readonly complete_children?: 'complete' | 'leave' } = {}): {
  readonly advance: 'next_future';
  readonly materialize_next: true;
  readonly complete_children?: 'complete' | 'leave';
} {
  return { ...SERIES_COMPLETE_BODY, ...extra };
}
