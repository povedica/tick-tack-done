import { CalendarCheck } from 'lucide-react';
import { Link } from 'react-router';
import { useDayPlanStatus } from '../planning/DayPlanEntry';
import { useMessages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { useWtFMessages } from '../planning/i18n-wt-f';
import { loadPhrase } from '../planning/triage/projectPlan';

export interface DayLoadBody {
  readonly task_minutes: number;
  readonly event_minutes?: number;
  readonly available_minutes: number | null;
  readonly unestimated_count: number;
  readonly status: 'ok' | 'tight' | 'overload';
}

export function TodayPlanStrip({
  load,
  loading,
  showLoad,
}: {
  readonly load: DayLoadBody | undefined;
  readonly loading: boolean;
  readonly showLoad: boolean;
}) {
  const m = useMessages();
  const locale = useAppLocale();
  const planning = useWtFMessages();
  const status = useDayPlanStatus();
  const saved = status.data?.initial_applied_at != null;
  const hasLoad = showLoad && load !== undefined && Number.isFinite(load.task_minutes);
  return (
    <section className="today-plan-strip" aria-label={m.todayPlanTitle}>
      <div className="today-plan-summary">
        <CalendarCheck size={18} aria-hidden="true" />
        <strong>{planning.title}</strong>
        {showLoad && loading ? (
          <span className="today-load-pending" role="status">
            {m.todayLoadPending}
          </span>
        ) : null}
        {hasLoad && load.available_minutes !== null && Number.isFinite(load.available_minutes) ? (
          <span className={`today-plan-load is-${load.status}`}>
            {loadPhrase({ ...load, event_minutes: load.event_minutes ?? 0 }, planning)}
          </span>
        ) : null}
      </div>
      {saved && status.data?.last_applied_at ? (
        <span className="ui-muted today-plan-saved">
          {planning.plannedAt}{' '}
          {new Intl.DateTimeFormat(locale, {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: status.data.time_zone,
          }).format(new Date(status.data.last_applied_at))}
        </span>
      ) : null}
      <div className="today-plan-actions">
        <Link
          className="ui-button is-primary is-sm"
          aria-label={saved ? planning.planAgain : planning.title}
          to="/plan/day"
        >
          {saved ? planning.planAgain : planning.title}
        </Link>
      </div>
    </section>
  );
}
