import type { ListTasksQuery } from '@reflexionia/sdk';

/** Year, month, week, day and agenda share one task window: start, due and overlap. */
export function calendarTaskQuery(from: string, to: string): ListTasksQuery {
  return {
    status: 'active',
    limit: 100,
    sort: 'due',
    from,
    to,
    rangeField: 'any',
    context: 'auto',
  };
}

export function uniqueById<T extends { readonly id: string }>(items: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of items) {
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
}
