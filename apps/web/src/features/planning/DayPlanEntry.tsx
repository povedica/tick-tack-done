import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { closingRequest } from '../closing/api';
import { PlanDayPage } from './PlanDayPage';

export interface PlanStatus {
  readonly initial_applied_at: string | null;
  readonly last_applied_at: string | null;
  readonly adjustment_count: number;
}
export function useDayPlanStatus() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const zone = me.data?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return useQuery({
    queryKey: ['day-plan-status', date, zone],
    enabled: me.data !== undefined,
    queryFn: () =>
      closingRequest<PlanStatus>(
        `/api/v1/plans?date=${date}&time_zone=${encodeURIComponent(zone)}`,
        'GET',
      ),
  });
}
export function DayPlanEntry() {
  return <PlanDayPage />;
}
