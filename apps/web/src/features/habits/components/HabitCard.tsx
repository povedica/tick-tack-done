import { useQuery } from '@tanstack/react-query';
import type { Habit } from '@reflexionia/sdk';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../../components/ui';
import { useMessages } from '../../../i18n';
import { useAppLocale } from '../../../i18n/locale';
import { api } from '../../../api';
import { useHabitCopy } from '../copy';
export function HabitCard({
  habit,
  week,
  onCheck,
  onEdit,
  onArchive,
  onDelete,
  busy,
}: {
  habit: Habit;
  week: readonly string[];
  onCheck: (date: string, count: number, note?: string | null) => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const m = useMessages();
  const t = useHabitCopy();
  const locale = useAppLocale();
  const [confirmUnmark, setConfirmUnmark] = useState(false);
  const stats = useQuery({
    queryKey: ['habit-stats', habit.id, Number(habit.today.date.slice(0, 4))],
    queryFn: () => api.habitStats(habit.id, Number(habit.today.date.slice(0, 4))),
  });
  const today = habit.today.date;
  return (
    <li className="habit-card-v2">
      <div className="habit-card-title">
        <Link to={`/habits/${habit.id}`}>
          {habit.icon ? <span aria-hidden="true">{habit.icon} </span> : null}
          {habit.name}
        </Link>
        <details>
          <summary aria-label={m.habitOpen}>⋯</summary>
          <div className="habit-card-menu">
            <button type="button" onClick={onEdit}>
              {t.edit}
            </button>
            <button type="button" onClick={onArchive}>
              {m.archive}
            </button>
            <button type="button" onClick={onDelete}>
              {t.remove}
            </button>
          </div>
        </details>
      </div>
      <small>
        {t.total}: {stats.data?.total_checkins ?? '—'} · {m.streakCurrent}:{' '}
        {stats.data?.streak_current ?? '—'}
      </small>
      {habit.challenge_days ? (
        <small>
          {Math.min(stats.data?.completed_days ?? 0, habit.challenge_days)}/{habit.challenge_days} ·{' '}
          {(stats.data?.completed_days ?? 0) >= habit.challenge_days
            ? t.completed
            : `${String(habit.challenge_days - (stats.data?.completed_days ?? 0))} ${t.remaining}`}
        </small>
      ) : null}
      <div className="habit-week-points">
        {week.map((date) => {
          const cell = stats.data?.heatmap.find((cell) => cell.date === date);
          const scheduled = cell?.scheduled ?? false;
          const met = date === today ? habit.today.met : (cell?.met ?? false);
          const count = date === today ? habit.today.count : (cell?.count ?? 0);
          const label = new Date(`${date}T12:00:00`).toLocaleDateString(locale, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          });
          return (
            <button
              type="button"
              key={date}
              className={met ? 'is-done' : ''}
              disabled={
                busy || date > today || !scheduled || (met && habit.goal.target_count === 1)
              }
              aria-label={`${m.checkIn} · ${label} · ${String(count)}/${String(habit.goal.target_count)}`}
              title={label}
              onClick={() => {
                onCheck(date, count + 1);
              }}
            >
              <span>
                {new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: 'narrow' })}
              </span>
              <i>{met ? '✓' : count || ''}</i>
            </button>
          );
        })}
      </div>
      {habit.today.count > 0 ? (
        confirmUnmark ? (
          <div className="token-confirm" role="alertdialog">
            <p>{t.confirmUnmark}</p>
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
                disabled={busy}
                onClick={() => {
                  setConfirmUnmark(false);
                  onCheck(today, 0, null);
                }}
              >
                {t.unmark}
              </Button>
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              setConfirmUnmark(true);
            }}
          >
            {t.unmark}
          </button>
        )
      ) : null}
      <label className="habit-note-field">
        {t.note}
        <input
          key={habit.today.note ?? ''}
          defaultValue={habit.today.note ?? ''}
          maxLength={2000}
          onBlur={(e) => {
            if (e.target.value !== (habit.today.note ?? ''))
              onCheck(today, habit.today.count, e.target.value);
          }}
        />
      </label>
    </li>
  );
}
