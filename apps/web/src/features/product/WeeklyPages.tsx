import { useState } from 'react';
import { Check, Sun, CalendarDays, Ban } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Button } from '../../components/ui';
import { calendarDay, shiftDayKey, zonedWallTime } from '../today/groups';
import { completeBody } from '../tasks/complete-body';
import { refreshTaskSurfaces } from '../tasks/refresh';
import { displayTitle } from '../tasks/displayTitle';
import './weekly.css';
import { useWeeklyCopy } from './weekly-text';

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (typeof v === 'object' && v !== null ? (v as Row) : {});
const list = (v: unknown): Row[] => (Array.isArray(v) ? v.map(row) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const formatDate = (date: string, locale: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

export function ReportsPage() {
  const copy = useWeeklyCopy();
  const dateLabel = (date: string) => formatDate(date, copy.locale);
  const { week } = useParams();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['weekly-reports'], queryFn: () => api.weeklyReports() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rows = list(row(query.data).items);
  const current = week === undefined ? rows[0] : rows.find((r) => r.week === week);
  const payload = row(current?.payload);
  const days = list(payload.days);
  const start = str(current?.week);
  const today = calendarDay(new Date().toISOString(), str(payload.time_zone) || zone);
  const end = start ? shiftDayKey(start, 6) : '';
  const ongoing = start <= today && today <= end;
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
      void navigate(`/reports/weekly/${str(result.week)}`);
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
      {query.isLoading ? (
        <p role="status">{copy.loading}</p>
      ) : query.isError ? (
        <p role="alert">
          {copy.loadError}{' '}
          <Button
            onClick={() => {
              void query.refetch();
            }}
          >
            {copy.retry}
          </Button>
        </p>
      ) : current ? (
        <>
          <div className="week-selector">
            <Button
              aria-label={copy.previousWeek}
              disabled={rows.indexOf(current) === rows.length - 1}
              onClick={() => {
                void navigate(`/reports/weekly/${str(rows[rows.indexOf(current) + 1]?.week)}`);
              }}
            >
              ←
            </Button>
            <label>
              {copy.week}
              <select
                value={start}
                onChange={(e) => {
                  void navigate(`/reports/weekly/${e.target.value}`);
                }}
              >
                {rows.map((r) => (
                  <option key={str(r.week)} value={str(r.week)}>
                    {dateLabel(str(r.week))} – {dateLabel(shiftDayKey(str(r.week), 6))}
                  </option>
                ))}
              </select>
            </label>
            <Button
              aria-label={copy.nextWeek}
              disabled={rows.indexOf(current) === 0}
              onClick={() => {
                void navigate(`/reports/weekly/${str(rows[rows.indexOf(current) - 1]?.week)}`);
              }}
            >
              →
            </Button>
          </div>
          <p className="week-status">
            {ongoing
              ? typeof payload.calculated_at === 'string'
                ? copy.until(
                    dateLabel(calendarDay(payload.calculated_at, str(payload.time_zone) || zone)),
                  )
                : copy.inProgress
              : copy.closedWeek}
          </p>
          <p className="week-balance">
            {valid ? copy.balance(completed, created) : copy.unverified}
          </p>
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
            void update();
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
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['review-weekly'], queryFn: () => api.reviewWeekly() });
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const data = row(query.data);
  const ids = Array.isArray(data[step === 1 ? 'overdue_ids' : 'undated_ids'])
    ? (data[step === 1 ? 'overdue_ids' : 'undated_ids'] as unknown[])
    : [];
  const tasks = list(data.tasks).filter((t) => ids.includes(t.id));
  const eligible = tasks.filter((t) => t.recurring === false && selected.includes(str(t.id)));
  async function act(action: 'done' | 'today' | 'tomorrow' | 'cancel') {
    if (!eligible.length || busy) return;
    if (
      (action === 'done' || action === 'cancel') &&
      !window.confirm(copy.confirm(action === 'done', eligible.length))
    )
      return;
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
              void query.refetch();
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
                    <label className="week-select">
                      <input
                        type="checkbox"
                        aria-label={copy.select(displayTitle(str(t.title)))}
                        disabled={busy || recurring}
                        checked={selected.includes(id)}
                        onChange={(e) => {
                          setSelected((old) =>
                            e.target.checked ? [...old, id] : old.filter((value) => value !== id),
                          );
                        }}
                      />
                    </label>
                    <Link
                      className="weekly-task-title"
                      to={`/list/${str(t.listId)}?task=${id}`}
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
          <span>{copy.selected(eligible.length)}</span>
          <Button
            disabled={busy}
            onClick={() => {
              void act('done');
            }}
          >
            <Check size={16} aria-hidden="true" />
            {copy.done}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              void act('today');
            }}
          >
            <Sun size={16} aria-hidden="true" />
            {copy.today}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              void act('tomorrow');
            }}
          >
            <CalendarDays size={16} aria-hidden="true" />
            {copy.tomorrow}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              void act('cancel');
            }}
          >
            <Ban size={16} aria-hidden="true" />
            {copy.cancel}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
