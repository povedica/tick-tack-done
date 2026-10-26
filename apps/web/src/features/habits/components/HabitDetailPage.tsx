import { ArrowLeft, Target, Flame, Percent, TrendingUp } from 'lucide-react';
import { Popover } from '../../../components/Popover';
import { HabitMonthCalendar } from './HabitMonthCalendar';
import { runAction } from '../../../components/run-action';
import { useState } from 'react';
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../../../api';
import { HABIT_WEEKDAYS } from '@reflexionia/domain';
import { Button } from '../../../components/ui';
import { useMessages } from '../../../i18n';
import { HabitActions } from './HabitActions';
import { HabitEditor } from './HabitEditor';
import { HabitConstancy } from './HabitConstancy';
import { useHabitCopy } from '../copy';
import '../habits.css';
export function HabitDetailPage() {
  const { id = '' } = useParams();
  const m = useMessages();
  const t = useHabitCopy();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [editing, setEditing] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [count, setCount] = useState(1);
  const [note, setNote] = useState('');
  const [error, setError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUnmark, setConfirmUnmark] = useState(false);
  const habit = useQuery({ queryKey: ['habit', id], queryFn: () => api.getHabit(id) });
  const stats = useQuery({
    queryKey: ['habit-stats', id, month.getFullYear()],
    queryFn: () => api.habitStats(id, month.getFullYear()),
    placeholderData: (previous) => previous,
  });
  const currentDate = habit.data?.today.date ?? '1970-01-01';
  const monday = new Date(`${currentDate}T12:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const currentWeek = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
  const weekYears = [...new Set(currentWeek.map((date) => Number(date.slice(0, 4))))];
  const weekStats = useQueries({
    queries: weekYears.map((year) => ({
      queryKey: ['habit-stats', id, year],
      queryFn: () => api.habitStats(id, year),
      enabled: !!habit.data,
    })),
  });
  const refresh = async () => {
    for (const key of ['habit', 'habits', 'habit-stats', 'stats', 'achievements', 'dashboard'])
      await cache.invalidateQueries({ queryKey: [key] });
  };
  const mutation = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      setError(false);
      await refresh();
    },
    onError: () => {
      setError(true);
    },
  });
  const back = (
    <Link className="ui-button is-ghost is-sm habit-detail-back" to="/habits">
      <ArrowLeft size={16} aria-hidden="true" />
      {t.backToHabits}
    </Link>
  );
  if (habit.isPending || stats.isPending)
    return (
      <section className="screen-page habit-detail-v2">
        {back}
        <p role="status">{m.habitSaving}</p>
      </section>
    );
  if (!habit.data || !stats.data)
    return (
      <section className="screen-page habit-detail-v2">
        {back}
        <p role="alert">{t.failed}</p>
        <Button
          onClick={() => {
            runAction(habit.refetch());
            runAction(stats.refetch());
          }}
        >
          {m.retry}
        </Button>
      </section>
    );
  const h = habit.data;
  const s = stats.data;
  const prefix = `${String(month.getFullYear())}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const cells = s.heatmap.filter((cell) => cell.date.startsWith(prefix));

  const weekCells = currentWeek.map((date) => {
    const cell = weekStats[weekYears.indexOf(Number(date.slice(0, 4)))]?.data?.heatmap.find(
      (row) => row.date === date,
    );
    const weekday = HABIT_WEEKDAYS[(new Date(`${date}T12:00Z`).getUTCDay() + 6) % 7] ?? 'monday';
    return {
      scheduled:
        cell?.scheduled ??
        (h.frequency.includes(weekday) && (!h.start_date || date >= h.start_date)),
      met: date === h.today.date ? h.today.met : (cell?.met ?? false),
      date,
    };
  });
  const weeklyDone = weekCells.filter((cell) => cell.met && cell.date <= h.today.date).length;
  const scheduledDays = weekCells.filter((cell) => cell.scheduled).length;
  const weeklyTarget =
    h.goal.period === 'week' ? Math.min(h.goal.times_per_period, scheduledDays) : scheduledDays;
  const editDay = (date: string) => {
    const log = s.logs.find((log) => log.date === date);
    setConfirmUnmark(false);
    setDay(date);
    setCount(log?.count ?? 1);
    setNote(log?.note ?? '');
  };
  const saveLog = (next: number) => {
    if (!day) return;
    mutation.mutate(async () => {
      await api.checkInHabit(
        id,
        { date: day, count: next, note: next === 0 ? null : note },
        crypto.randomUUID(),
      );
      setDay(null);
    });
  };
  return (
    <section className="screen-page habits-redesign habit-detail-v2">
      {back}
      <header className="habit-head">
        <h1>{h.name}</h1>
        <HabitActions
          label={h.name}
          paused={h.paused || h.archived}
          busy={mutation.isPending}
          onEdit={() => {
            setEditing(true);
          }}
          onPause={() => {
            mutation.mutate(() =>
              api.updateHabit(
                id,
                h.archived ? { archived: false, paused: false } : { paused: !h.paused },
              ),
            );
          }}
          onDelete={() => {
            setConfirmDelete(true);
          }}
        />
      </header>
      {confirmDelete ? (
        <div className="token-confirm" role="alertdialog">
          <p>{t.confirmDelete}</p>
          <span className="token-actions">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setConfirmDelete(false);
              }}
            >
              {m.cancel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={() => {
                setConfirmDelete(false);
                mutation.mutate(async () => {
                  await api.deleteHabit(id);
                  runAction(Promise.resolve(navigate('/habits')));
                });
              }}
            >
              {t.remove}
            </Button>
          </span>
        </div>
      ) : null}
      {error ? <p role="alert">{t.failed}</p> : null}
      {editing ? (
        <HabitEditor
          habit={h}
          busy={mutation.isPending}
          onCancel={() => {
            setEditing(false);
          }}
          onSave={(body) => {
            mutation.mutate(async () => {
              await api.updateHabit(id, body);
              setEditing(false);
            });
          }}
        />
      ) : null}
      {h.motivation_note ? <p>{h.motivation_note}</p> : null}
      <div className="habit-detail-metrics">
        <div>
          <span>
            <Target size={16} aria-hidden="true" />
            {t.weekGoal}
          </span>
          <strong>
            {weekStats.every((query) => query.isSuccess) ? weeklyDone : '—'} / {weeklyTarget}
          </strong>
        </div>
        <div>
          <span>
            <TrendingUp size={16} aria-hidden="true" />
            {t.completedDays}
          </span>
          <strong>
            {s.completed_days} <small>{t.days}</small>
          </strong>
        </div>
        <div>
          <span>
            <Percent size={16} aria-hidden="true" />
            {t.monthRate}
          </span>
          <strong>
            {Math.round(
              (cells.filter((cell) => cell.met).length /
                Math.max(
                  1,
                  cells.filter((cell) => cell.scheduled && cell.date <= h.today.date).length,
                )) *
                100,
            )}
            <small>%</small>
          </strong>
        </div>
        <div>
          <span>
            <Flame size={16} aria-hidden="true" />
            {m.streakCurrent}
          </span>
          <strong>
            {s.streak_current} <small>{h.goal.period === 'week' ? t.weeks : t.days}</small>
          </strong>
        </div>
      </div>
      {h.challenge_days ? (
        <p className="habit-challenge">
          {Math.min(s.completed_days, h.challenge_days)}/{h.challenge_days} ·{' '}
          {s.completed_days >= h.challenge_days
            ? t.completed
            : `${String(h.challenge_days - s.completed_days)} ${t.remaining}`}
        </p>
      ) : null}
      <section className="habit-detail-calendar" aria-label={t.history}>
        <HabitMonthCalendar
          habit={h}
          busy={mutation.isPending}
          onSelect={editDay}
          onMonthChange={setMonth}
        />
      </section>
      {day ? (
        <Popover
          open
          centered
          mobileSheet
          width={440}
          label={t.editDay}
          className="popover habit-log-dialog"
          onClose={() => {
            setDay(null);
            setConfirmUnmark(false);
          }}
        >
          <form
            className="habit-log-editor"
            aria-label={t.editDay}
            onSubmit={(event) => {
              event.preventDefault();
              saveLog(count);
            }}
          >
            <strong>{day}</strong>
            <label>
              {t.count}
              <input
                type="number"
                required
                min={1}
                max={10000}
                value={count}
                onChange={(e) => {
                  setCount(Number(e.target.value));
                }}
              />
            </label>
            <label>
              {t.note}
              <textarea
                maxLength={2000}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                }}
              />
            </label>
            <div className="habit-actions">
              <Button type="submit" variant="primary" disabled={mutation.isPending}>
                {t.save}
              </Button>
              {confirmUnmark ? (
                <span className="token-actions">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setConfirmUnmark(false);
                    }}
                  >
                    {m.cancel}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setConfirmUnmark(false);
                      saveLog(0);
                    }}
                  >
                    {t.unmark}
                  </Button>
                </span>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setConfirmUnmark(true);
                  }}
                >
                  {t.unmark}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDay(null);
                }}
              >
                {t.close}
              </Button>
            </div>
          </form>
        </Popover>
      ) : null}
      <HabitConstancy
        habits={[h]}
        today={h.today.date}
        onSelect={(cell) => {
          if (cell.date <= h.today.date && cell.scheduled && !h.paused && !h.archived)
            editDay(cell.date);
        }}
      />
      <section className="habit-detail-notes">
        <h2>{t.notes}</h2>
        {!s.logs.some((log) => log.note) ? <p className="ui-muted">{t.noNotes}</p> : null}
        <ul className="habit-notes">
          {s.logs
            .filter((log) => log.note)
            .map((log) => (
              <li key={log.date}>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    editDay(log.date);
                  }}
                >
                  {log.date} · {log.count}
                </button>
                <p>{log.note}</p>
              </li>
            ))}
        </ul>
      </section>
    </section>
  );
}
