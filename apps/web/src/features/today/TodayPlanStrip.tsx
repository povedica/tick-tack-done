import { CalendarCheck, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { useDayPlanStatus } from '../planning/DayPlanEntry';
import { useMessages } from '../../i18n';
import { useAppLocale } from '../../i18n/locale';
import { pluralMessage } from '../../i18n/plural';

export interface DayLoadBody {
  readonly task_minutes: number;
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
  const status = useDayPlanStatus();
  const saved = status.data?.initial_applied_at != null;
  const hasLoad = showLoad && load !== undefined && Number.isFinite(load.task_minutes);
  return (
    <section className="today-plan-strip" aria-label={m.todayPlanTitle}>
      <div className="today-plan-summary">
        <CalendarCheck size={18} aria-hidden="true" />
        <strong>{m.todayPlanTitle}</strong>
        {showLoad && loading ? (
          <span className="today-load-pending" role="status">
            {m.todayLoadPending}
          </span>
        ) : null}
        {hasLoad && load.available_minutes !== null && Number.isFinite(load.available_minutes) ? (
          <span className="today-plan-load">
            {hoursLabel(load.task_minutes)} {m.todayLoadOf} {hoursLabel(load.available_minutes)}
          </span>
        ) : null}
      </div>
      {hasLoad && load.unestimated_count > 0 ? (
        <span className="today-plan-warning">
          <TriangleAlert size={14} aria-hidden="true" />
          {pluralMessage(locale, load.unestimated_count, {
            one: m.todayUnestimated_one,
            other: m.todayUnestimated_other,
          })}
        </span>
      ) : null}
      {saved && status.data?.last_applied_at ? (
        <span className="ui-muted today-plan-saved">
          {m.planSavedAt
            .replace(
              '{time}',
              new Date(status.data.last_applied_at).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              }),
            )
            .replace('{count}', String(status.data.adjustment_count))}
        </span>
      ) : null}
      <div className="today-plan-actions">
        <Link className="ui-button is-primary is-sm" aria-label={m.planMyDay} to="/plan/day">
          {saved ? m.todayPlanTitle : m.todayPlanAction}
        </Link>
      </div>
    </section>
  );
}

function hoursLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${String(rest)} min`;
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
}
