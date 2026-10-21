import { useQuery } from '@tanstack/react-query';
import { tickyApi } from './api';

/** All entry points share the server capability; unknown or failed means unavailable. */
export function useTickyFlags() {
  return useQuery({
    queryKey: ['ticky', 'flags'],
    queryFn: tickyApi.flags,
    staleTime: 30_000,
    retry: false,
  });
}
