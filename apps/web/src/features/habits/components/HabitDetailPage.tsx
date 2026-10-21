import { runAction } from '../../../components/run-action';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../../../api';
import { Button } from '../../../components/ui';
import { useActionToast } from '../../../components/action-toast';
import { useMessages } from '../../../i18n';
import { useAppLocale } from '../../../i18n/locale';
import { HabitEditor } from './HabitEditor';
import { useHabitCopy } from '../copy';
import '../habits.css';
export function HabitDetailPage() {
  const { id = '' } = useParams();
  const m = useMessages();
  const t = useHabitCopy();
  const locale = useAppLocale();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const toast = useActionToast((state) => state.show);
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
  if (habit.isPending || stats.isPending) return <p role="status">{m.habitSaving}</p>;
  if (!habit.data || !stats.data)
    return (
      <section className="screen-page">
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
  const shift = (amount: number) => {
    setMonth((old) => new Date(old.getFullYear(), old.getMonth() + amount, 1));
    setDay(null);
  };
  const prefix = `${String(month.getFullYear())}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const cells = s.heatmap.filter((cell) => cell.date.startsWith(prefix));
  const offset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const editDay = (date: string) => {
    const log = s.logs.find((log) => log.date === date);
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
    <section className="screen-page habit-detail-v2">
      <Link to="/habits">{m.habitsTitle}</Link>
      <header className="habit-head">
        <h1>
          {h.icon} {h.name}
        </h1>
        <div className="habit-actions">
          <Button
            size="sm"
            onClick={() => {
              setEditing((old) => !old);
            }}
          >
            {t.edit}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              mutation.mutate(async () => {
                await api.updateHabit(id, { archived: !h.archived });
                toast(h.archived ? t.recovered : t.archived, () => {
                  mutation.mutate(() => api.updateHabit(id, { archived: h.archived }));
                });
              });
            }}
          >
            {h.archived ? m.habitUnarchive : m.archive}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setConfirmDelete(true);
            }}
          >
            {t.remove}
          </Button>
        </div>
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
        <p>
          <span>{m.streakCurrent}</span>
          <strong>{s.streak_current}</strong>
        </p>
        <p>
          <span>{t.month}</span>
          <strong>{s.month_checkins}</strong>
        </p>
        <p>
          <span>{t.total}</span>
          <strong>{s.total_checkins}</strong>
        </p>
      </div>
      {h.challenge_days ? (
        <p className="habit-challenge">
          {Math.min(s.completed_days, h.challenge_days)}/{h.challenge_days} ·{' '}
          {s.completed_days >= h.challenge_days
            ? t.completed
            : `${String(h.challenge_days - s.completed_days)} ${t.remaining}`}
        </p>
      ) : null}
      <div className="habit-history-toolbar">
        <Button
          aria-label={m.calPrev}
          onClick={() => {
            shift(-1);
          }}
        >
          ‹
        </Button>
        <h2>{month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</h2>
        <Button
          aria-label={m.calNext}
          onClick={() => {
            shift(1);
          }}
        >
          ›
        </Button>
      </div>
      <div className="habit-month-grid" aria-label={t.history}>
        {Array.from({ length: 7 }, (_, i) => (
          <span key={`head-${String(i)}`}>
            {new Date(2026, 0, 5 + i).toLocaleDateString(locale, { weekday: 'narrow' })}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`empty-${String(i)}`} />
        ))}
        {cells.map((cell) => (
          <button
            key={cell.date}
            type="button"
            data-scheduled={cell.scheduled}
            data-met={cell.met}
            data-today={cell.date === h.today.date}
            disabled={
              mutation.isPending ||
              cell.date > h.today.date ||
              (!cell.scheduled && cell.count === 0)
            }
            aria-label={`${cell.date} · ${String(cell.count)}`}
            onClick={() => {
              editDay(cell.date);
            }}
          >
            {Number(cell.date.slice(-2))}
            {cell.met ? ' ✓' : ''}
          </button>
        ))}
      </div>
      {day ? (
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
      ) : null}
      <h2>{t.notes}</h2>
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
  );
}
