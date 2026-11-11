import type { Filter, FilterPage } from '@reflexionia/sdk';
import type { QueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { useFilterUi } from './filter-ui';

export async function refreshFilters(queryClient: QueryClient, id?: string): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ['filters'] });
  if (id !== undefined) {
    await queryClient.invalidateQueries({ queryKey: ['filter-tasks', id] });
  }
}

export function pinFilter(
  queryClient: QueryClient,
  filter: Filter,
  pinnedLabel: string,
  unpinnedLabel: string,
): void {
  const next = !filter.pinned;
  void api
    .updateFilter(filter.id, { pinned: next })
    .then(async () => {
      useFilterUi.getState().announce(next ? pinnedLabel : unpinnedLabel);
      await refreshFilters(queryClient, filter.id);
    })
    .catch(() => undefined);
}

export function duplicateFilter(queryClient: QueryClient, filter: Filter, announced: string): void {
  void api
    .createFilter(
      {
        name: `${filter.name} (copia)`,
        color: filter.color,
        mode: filter.mode,
        rules: filter.rules,
      },
      crypto.randomUUID(),
    )
    .then(async () => {
      useFilterUi.getState().announce(announced);
      await refreshFilters(queryClient);
    })
    .catch(() => undefined);
}

export function deleteFilter(
  queryClient: QueryClient,
  filter: { readonly id: string; readonly name: string },
  failed: string,
): void {
  const previous = queryClient.getQueryData<FilterPage>(['filters']);
  queryClient.setQueryData<FilterPage | undefined>(['filters'], (current) => {
    if (current === undefined) {
      return current;
    }
    return { ...current, items: current.items.filter((item) => item.id !== filter.id) };
  });
  useFilterUi.getState().cancelDelete();
  useFilterUi.getState().pushToast({ id: filter.id, name: filter.name });
  void api.deleteFilter(filter.id).catch(() => {
    queryClient.setQueryData(['filters'], previous);
    useFilterUi.getState().dropToast(filter.id);
    useFilterUi.getState().announce(failed);
  });
}

export function restoreFilter(queryClient: QueryClient, id: string, restored: string): void {
  useFilterUi.getState().dropToast(id);
  void api
    .restoreFilter(id)
    .then(async () => {
      useFilterUi.getState().announce(restored);
      await refreshFilters(queryClient, id);
    })
    .catch(() => undefined);
}
