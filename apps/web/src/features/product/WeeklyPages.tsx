import { runAction } from '../../components/run-action';
import { useState } from 'react';
import { ApiError } from '@reflexionia/sdk';
import { Check, Sun, CalendarDays, Ban } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Button } from '../../components/ui';
import { PriorityCheck } from '../../components/PriorityCheck';
import { WeekPicker } from './WeekPicker';
import { calendarDay, shiftDayKey, zonedWallTime } from '../today/groups';
import { completeBody } from '../tasks/complete-body';
import { refreshTaskSurfaces } from '../tasks/refresh';
import { displayTitle } from '../tasks/displayTitle';
import { taskQueryHref } from '../../shell/use-open-task';
import './weekly.css';
import { useWeeklyCopy } from './weekly-text';
import { useMessages } from '../../i18n';
import { statsApi } from '../statistics/api';
import { reportDays } from './report-days';

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (typeof v === 'object' && v !== null ? (v as Row) : {});
const list = (v: unknown): Row[] => (Array.isArray(v) ? v.map(row) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const formatDate = (date: string, locale: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

export function ReportsPage() {
  const messages = useMessages();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const timeZone = me.data?.time_zone ?? zone;
  const today = calendarDay(new Date().toISOString(), timeZone);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const currentWeek = shiftDayKey(today, -(weekday === 0 ? 6 : weekday - 1));
  const copy = useWeeklyCopy();
  const dateLabel = (date: string) => formatDate(date, copy.locale);
  const { week } = useParams();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['weekly-reports'], queryFn: () => api.weeklyReports() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rows = list(row(query.data).items);
  const selectedWeek = week ?? currentWeek;
  const listed = rows.find((r) => r.week === selectedWeek);
  const missing = (error: unknown) => error instanceof ApiError && error.status === 404;
  const detail = useQuery({
    queryKey: ['weekly-report', week],
    queryFn: () => api.weeklyReport(week ?? ''),
    enabled: query.isSuccess && week !== undefined && listed === undefined,
    retry: (count, error) => !missing(error) && count < 2,
  });
  const current =
    listed ??
    (detail.isSuccess
      ? row(detail.data)
      : selectedWeek === currentWeek
        ? { week: currentWeek, payload: {} }
        : undefined);
  const payload = row(current?.payload);
  const start = str(current?.week);
  const end = start ? shiftDayKey(start, 6) : '';
  const ongoing = start <= today && today <= end;
  const statsParams = { from: start, to: end, tz: timeZone };
  const statistics = useQuery({
    queryKey: ['stats', 'overview', statsParams],
    queryFn: () => statsApi.overview(statsParams),
    enabled: ongoing && !!me.data,
    staleTime: 60_000,
  });
  const days = reportDays(payload.days, statistics.data?.daily, ongoing, start, today);
  const live = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.dashboardData(),
    enabled: ongoing,
  });
  const overdue = row(row(live.data).widgets).overdue;
  const completed = days.reduce((sum, d) => sum + num(d.completed), 0);
  const created = days.reduce((sum, d) => sum + num(d.created), 0);
  const valid = days.length === 7;
  const peak = Math.max(1, ...days.flatMap((d) => [num(d.completed), num(d.created)]));
  async function update() {
    setBusy(true);
    setError('');
    try {
      const result = row(await api.buildWeeklyReport());
      await query.refetch();
      runAction(Promise.resolve(navigate(`/reports/weekly/${str(result.week)}`)));
    } catch {
      setError(copy.refreshError);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="screen-page is-wide weekly-page">
      <header className="page-header">
        <div>
          <h1>{copy.title}</h1>
          <p className="lede">{copy.lead}</p>
        </div>
        <Link to="/statistics">{copy.stats}</Link>
      </header>
      {query.isSuccess ? (
        <WeekPicker
          value={week ?? start}
          available={rows.map((r) => str(r.week))}
          today={today}
          onSelect={(value) => {
            runAction(Promise.resolve(navigate(`/reports/weekly/${value}`)));
          }}
        />
      ) : null}
      {query.isLoading || detail.isFetching ? (
        <p role="status">{copy.loading}</p>
      ) : query.isError || (detail.isError && !missing(detail.error)) ? (
        <p role="alert">
          {copy.loadError}{' '}
          <Button
            onClick={() => {
              if (listed === undefined && week !== undefined) {
                runAction(detail.refetch());
              } else {
                runAction(query.refetch());
              }
            }}
          >
            {copy.retry}
          </Button>
        </p>
      ) : current ? (
        <>
          <p className="week-status">
            {ongoing
              ? messages.reportThroughToday.replace(
                  '{date}',
                  new Date(`${today}T12:00:00Z`).toLocaleDateString(copy.locale, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'UTC',
                  }),
                )
              : copy.closedWeek}
          </p>
          {ongoing && statistics.isError ? (
            <p role="alert">
              {copy.loadError}{' '}
              <Button
                onClick={() => {
                  runAction(statistics.refetch());
                }}
              >
                {copy.retry}
              </Button>
            </p>
          ) : ongoing && statistics.isPending ? (
            <p role="status">{copy.loading}</p>
          ) : (
            <p className="week-balance">
              {valid ? copy.balance(completed, created) : copy.unverified}
            </p>
          )}
          {!valid && listed === undefined ? <p>{copy.empty}</p> : null}
          <div className="week-cards">
            <article className="week-card week-main">
              <Link to="/statistics/tasks">{copy.completed}</Link>
              <strong>{valid ? completed : '—'}</strong>
              <span>{valid ? copy.createdInWeek(created) : copy.noData}</span>
            </article>
            <article className="week-card">
              <Link to="/statistics/habits">{copy.habits}</Link>
              <strong>
                {payload.metrics_version === 2 && num(payload.habits_expected) > 0
                  ? copy.habitCount(num(payload.habits_done), num(payload.habits_expected))
                  : copy.noData}
              </strong>
              <span>
                {ongoing
                  ? typeof payload.calculated_at === 'string'
                    ? copy.through(
                        dateLabel(
                          calendarDay(payload.calculated_at, str(payload.time_zone) || zone),
                        ),
                      )
                    : copy.duringWeek
                  : copy.duringWeek}
              </span>
            </article>
            <article className="week-card">
              <Link to="/statistics/focus">{copy.focus}</Link>
              <strong>
                {typeof payload.focus_minutes !== 'number'
                  ? copy.noData
                  : `${num(payload.focus_minutes).toLocaleString(copy.locale, { maximumFractionDigits: 1 })} min`}
              </strong>
            </article>
          </div>
          {ongoing && live.isSuccess && typeof overdue === 'number' ? (
            <aside className="week-current">
              <strong>{copy.overdueNow(num(overdue))}</strong>
              <span>{copy.currentState}</span>
            </aside>
          ) : null}
          {valid ? (
            <section>
              <h2>{copy.byDay}</h2>
              <p className="ui-muted">{copy.legend}</p>
              <div className="week-chart">
                {days.map((d) => {
                  const future = str(d.date) > today;
                  return (
                    <div key={str(d.date)} className="week-day">
                      <div className="week-bars">
                        {!future ? (
                          <>
                            <i style={{ height: `${String((num(d.completed) / peak) * 100)}%` }} />
                            <i style={{ height: `${String((num(d.created) / peak) * 100)}%` }} />
                          </>
                        ) : null}
                      </div>
                      <strong>
                        {future ? '—' : `${String(num(d.completed))} · ${String(num(d.created))}`}
                      </strong>
                      <span>
                        {new Date(`${str(d.date)}T12:00:00Z`).toLocaleDateString(copy.locale, {
                          weekday: 'short',
                        })}
                      </span>
                      <small>{dateLabel(str(d.date))}</small>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
          {payload.metrics_version !== 2 ? <p className="ui-muted">{copy.oldReport}</p> : null}
        </>
      ) : (
        <p>{copy.empty}</p>
      )}
      <footer className="week-footer">
        <span>
          {typeof payload.calculated_at === 'string'
            ? copy.calculated(new Date(payload.calculated_at).toLocaleString(copy.locale))
            : copy.unknownCalculation}
        </span>
        <Button
          disabled={busy}
          onClick={() => {
            runAction(update());
          }}
        >
          {busy ? copy.refreshing : copy.refresh}
        </Button>
      </footer>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

export function ReviewPage() {
  const copy = useWeeklyCopy();
  const location = useLocation();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['review-weekly'], queryFn: () => api.reviewWeekly() });
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmAction, setConfirmAction] = useState<'done' | 'cancel' | null>(null);
  const data = row(query.data);
  const ids = Array.isArray(data[step === 1 ? 'overdue_ids' : 'undated_ids'])
    ? (data[step === 1 ? 'overdue_ids' : 'undated_ids'] as unknown[])
    : [];
  const tasks = list(data.tasks).filter((t) => ids.includes(t.id));
  const eligible = tasks.filter((t) => t.recurring === false && selected.includes(str(t.id)));
  async function act(action: 'done' | 'today' | 'tomorrow' | 'cancel', force = false) {
    if (!eligible.length || busy) return;
    if ((action === 'done' || action === 'cancel') && !force) {
      setConfirmAction(action);
      return;
    }
    setConfirmAction(null);
    setBusy(true);
    setNotice('');
    let succeeded = 0;
    try {
      for (const task of eligible) {
        const id = str(task.id);
        if (action === 'done') await api.completeTask(id, completeBody(), crypto.randomUUID());
        else if (action === 'cancel') await api.cancelTask(id);
        else {
          const due = zonedWallTime(
            shiftDayKey(calendarDay(new Date().toISOString(), zone), action === 'today' ? 0 : 1),
            0,
            0,
            zone,
          );
          if (!due) throw new Error();
          await api.patchTask(id, { due_date: due, is_all_day: true, time_zone: zone });
        }
        succeeded++;
        setSelected((old) => old.filter((value) => value !== id));
      }
      setNotice(copy.result(succeeded, action));
    } catch {
      setNotice(copy.failed(succeeded));
    } finally {
      await refreshTaskSurfaces(queryClient);
      await query.refetch();
      setBusy(false);
    }
  }
  return (
    <section className="screen-page is-wide weekly-page review-page">
      <header className="page-header">
        <div>
          <h1>{copy.reviewTitle}</h1>
          <p className="lede">{copy.reviewLead}</p>
        </div>
        <Link to="/today">{copy.finishReview}</Link>
      </header>
      <nav className="week-steps" aria-label={copy.steps}>
        {[copy.inbox, copy.overdue, copy.undated, copy.prepareWeek].map((title, index) => (
          <Button
            key={title}
            aria-current={step === index ? 'step' : undefined}
            onClick={() => {
              setStep(index);
              setSelected([]);
            }}
          >
            {title}
          </Button>
        ))}
      </nav>
      {query.isLoading ? (
        <p role="status">{copy.reviewLoading}</p>
      ) : query.isError ? (
        <p role="alert">
          {copy.loadError}{' '}
          <Button
            onClick={() => {
              runAction(query.refetch());
            }}
          >
            {copy.retry}
          </Button>
        </p>
      ) : step === 0 ? (
        <div className="week-card">
          <h2>{copy.inboxTitle}</h2>
          <p>{copy.inboxLead}</p>
          <Link to="/inbox">{copy.openInbox}</Link>
          <Button
            onClick={() => {
              setStep(1);
            }}
          >
            {copy.continue}
          </Button>
        </div>
      ) : step === 3 ? (
        <div className="week-card">
          <h2>{copy.prepareWeek}</h2>
          <Link to="/smart/next7">{copy.nextSeven}</Link>
          <h3>{copy.staleLists}</h3>
          {list(data.lists).map((t) => (
            <Link key={str(t.id)} to={`/list/${str(t.id)}`}>
              {str(t.name)}
            </Link>
          ))}
          <h3>{copy.atRisk}</h3>
          {list(data.habits).map((t) => (
            <Link key={str(t.id)} to={`/habits/${str(t.id)}`}>
              {str(t.name)}
            </Link>
          ))}
        </div>
      ) : (
        <>
          <h2>{step === 1 ? copy.reviewOverdue : copy.reviewUndated}</h2>
          <p className="ui-muted">{copy.count(tasks.length, eligible.length)}</p>
          {tasks.length === 0 ? (
            <p>{step === 1 ? copy.noOverdue : copy.noUndated}</p>
          ) : (
            <ul className="weekly-tasks">
              {tasks.map((t) => {
                const id = str(t.id);
                const recurring = t.recurring !== false;
                const days = t.dueDate
                  ? Math.max(
                      0,
                      Math.round(
                        (Date.parse(`${calendarDay(new Date().toISOString(), zone)}T12:00:00Z`) -
                          Date.parse(`${calendarDay(str(t.dueDate), zone)}T12:00:00Z`)) /
                          86400000,
                      ),
                    )
                  : 0;
                return (
                  <li key={id} className={selected.includes(id) ? 'is-selected' : ''}>
                    <PriorityCheck
                      priority="none"
                      label={copy.select(displayTitle(str(t.title)))}
                      disabled={busy || recurring}
                      checked={selected.includes(id)}
                      onChange={(e) => {
                        setSelected((old) =>
                          e.target.checked ? [...old, id] : old.filter((value) => value !== id),
                        );
                      }}
                    />
                    <Link
                      className="weekly-task-title"
                      to={taskQueryHref(location.pathname, location.search, id)}
                      title={str(t.title)}
                    >
                      {displayTitle(str(t.title))}
                    </Link>
                    <span className="weekly-task-context">
                      <span>{str(t.listName)}</span>
                      {days > 0 ? <small>{copy.daysAgo(days)}</small> : null}
                    </span>
                    {recurring ? <span className="weekly-repeat">{copy.recurring}</span> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      <p role="status">{notice}</p>
      {eligible.length > 0 ? (
        <div className="weekly-actions" aria-label={copy.actions}>
          <span className="weekly-selection-count" aria-live="polite">
            {copy.selected(eligible.length)}
          </span>
          <Button
            disabled={busy}
            onClick={() => {
              runAction(act('done'));
            }}
          >
            <Check size={16} aria-hidden="true" />
            {copy.done}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              runAction(act('today'));
            }}
          >
            <Sun size={16} aria-hidden="true" />
            {copy.today}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              runAction(act('tomorrow'));
            }}
          >
            <CalendarDays size={16} aria-hidden="true" />
            {copy.tomorrow}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              runAction(act('cancel'));
            }}
          >
            <Ban size={16} aria-hidden="true" />
            {copy.cancel}
          </Button>
          {confirmAction !== null ? (
            <div className="token-confirm" role="alertdialog">
              <p>{copy.confirm(confirmAction === 'done', eligible.length)}</p>
              <span className="token-actions">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setConfirmAction(null);
                  }}
                >
                  {copy.cancel}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    runAction(act(confirmAction, true));
                  }}
                >
                  {confirmAction === 'done' ? copy.done : copy.cancel}
                </Button>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
