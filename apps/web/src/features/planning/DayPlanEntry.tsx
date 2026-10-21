import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { useMessages } from '../../i18n';
import { closingRequest } from '../closing/api';
import { PlanDayPage } from './PlanDayPage';
import { AdjustmentPage } from './AdjustmentPage';

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
  const status = useDayPlanStatus();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const m = useMessages();
  if (status.isPending) return <p role="status">{m.saving}</p>;
  if (status.isError)
    return (
      <section className="screen-page">
        <p role="alert">{m.settingsFailed}</p>
        <button
          type="button"
          onClick={() => {
            void status.refetch();
          }}
        >
          {m.retry}
        </button>
      </section>
    );
  const enabled =
    (me.data as { features?: { day_replan?: boolean } } | undefined)?.features?.day_replan !==
    false;
  return status.data.initial_applied_at && enabled ? <AdjustmentPage /> : <PlanDayPage />;
}
