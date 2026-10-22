import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
export function useDriveConnection() {
  const google = useQuery({
    queryKey: ['google'],
    queryFn: () => api.integrationStatus('google'),
    staleTime: 30000,
    refetchOnWindowFocus: 'always',
  });
  const reconnect = google.data?.status === 'reauth_required';
  return {
    connected: google.data?.connected === true && !reconnect,
    reconnect,
    pending: google.isPending,
  };
}
export function rememberDriveReturn(): void {
  sessionStorage.setItem('ttd.google.return', window.location.pathname + window.location.search);
}
