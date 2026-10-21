import { MutationCache, QueryClient } from '@tanstack/react-query';
import { reportActionError } from './components/run-action';

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: reportActionError,
    }),
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false, retry: 1 },
    },
  });
}
