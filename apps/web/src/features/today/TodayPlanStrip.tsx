import { useRef, useState } from 'react';
import { CalendarCheck, MoreHorizontal, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { Popover } from '../../components/Popover';
import { useMessages } from '../../i18n';

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
  showReplan,
}: {
  readonly load: DayLoadBody | undefined;
  readonly loading: boolean;
  readonly showLoad: boolean;
  readonly showReplan: boolean;
}) {
  const m = useMessages();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    anchor.current?.focus();
  };
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
          {m.todayUnestimated.replace('{count}', String(load.unestimated_count))}
        </span>
      ) : null}
      <div className="today-plan-actions">
        <Link className="ui-button is-primary is-sm" aria-label={m.planMyDay} to="/plan/day">
          {m.todayPlanAction}
        </Link>
        {showReplan ? (
          <Link className="today-plan-secondary" to="/replan">
            {m.todayReplanAction}
          </Link>
        ) : null}
        {showReplan ? (
          <button
            type="button"
            ref={anchor}
            className="today-plan-more"
            aria-label={m.todayPlanMore}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => {
              setOpen((current) => !current);
            }}
          >
            <MoreHorizontal size={20} />
          </button>
        ) : null}
      </div>
      <Popover
        open={open}
        anchor={anchor}
        label={m.todayPlanMore}
        onClose={close}
        className="popover today-plan-menu"
      >
        {showReplan ? (
          <Link className="popover-row" to="/replan" onClick={close}>
            {m.todayReplanAction}
          </Link>
        ) : null}
      </Popover>
    </section>
  );
}

function hoursLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${String(rest)} min`;
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
}
