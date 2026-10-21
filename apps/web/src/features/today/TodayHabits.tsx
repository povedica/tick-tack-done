import { useState } from 'react';
import { Check, ChevronDown, EyeOff, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { Habit } from '@reflexionia/sdk';
import { api } from '../../api';
import { fill, useMessages } from '../../i18n';

const WEEK = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export function TodayHabits({
  habits,
  hidden,
  collapsed,
  onToggle,
  onDismiss,
}: {
  readonly habits: readonly Habit[];
  readonly hidden: boolean;
  readonly collapsed: boolean;
  readonly onToggle: (open: boolean) => void;
  readonly onDismiss: () => void;
}) {
  const m = useMessages();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState(false);
  const active = habits.filter((habit) => !habit.archived);
  const scheduled = active.filter((habit) => {
    const day = new Date(`${habit.today.date}T12:00:00Z`).getUTCDay();
    const weekday = WEEK[day];
    return weekday !== undefined && habit.frequency.includes(weekday);
  });
  const done = scheduled.filter((habit) => habit.today.met).length;
  if (habits.length === 0 && hidden) return null;
  return (
    <details className="task-group today-habits" open={!collapsed}>
      <summary
        onClick={(event) => {
          event.preventDefault();
          onToggle(collapsed);
        }}
      >
        <ChevronDown className="task-chevron" size={16} aria-hidden="true" />
        <span>{m.habitGroup}</span>
        {scheduled.length > 0 ? (
          <span className="task-count">
            {done}/{scheduled.length} {m.todayHabitCount}
          </span>
        ) : null}
      </summary>
      {habits.length === 0 ? (
        <div className="today-habit-ghost">
          <Link to="/habits" className="today-habit-add">
            <Plus size={18} aria-hidden="true" />
            <span>{m.todayHabitAdd}</span>
          </Link>
          <button type="button" onClick={onDismiss}>
            <EyeOff size={15} aria-hidden="true" />
            <span>{m.todayHabitHide}</span>
          </button>
        </div>
      ) : scheduled.length === 0 ? (
        <p className="today-habit-unscheduled">{m.todayHabitsNoneScheduled}</p>
      ) : (
        <ul className="task-list">
          {scheduled.map((habit) => {
            const met = habit.today.met;
            const percent =
              habit.goal.target_count > 0
                ? Math.min(100, Math.max(0, (habit.today.count / habit.goal.target_count) * 100))
                : 0;
            return (
              <li key={habit.id}>
                <div className={`task-row today-habit-row${met ? ' is-done' : ''}`}>
                  <button
                    type="button"
                    className={`habit-check${met ? ' is-done' : ''}`}
                    aria-label={fill(m.todayHabitCheck, habit.name)}
                    aria-pressed={met}
                    disabled={pending.has(habit.id) || (met && habit.goal.target_count === 1)}
                    onClick={() => {
                      setPending((current) => new Set(current).add(habit.id));
                      setError(false);
                      void api
                        .checkInHabit(
                          habit.id,
                          { date: habit.today.date, count: habit.today.count + 1 },
                          crypto.randomUUID(),
                        )
                        .then(async () => {
                          for (const key of ['habits', 'habit-stats', 'stats', 'dashboard'])
                            await queryClient.invalidateQueries({ queryKey: [key] });
                        })
                        .catch(() => {
                          setError(true);
                        })
                        .finally(() => {
                          setPending((current) => {
                            const next = new Set(current);
                            next.delete(habit.id);
                            return next;
                          });
                        });
                    }}
                  >
                    {met ? <Check size={13} aria-hidden="true" /> : null}
                  </button>
                  <Link className="task-title" to={`/habits/${habit.id}`}>
                    {habit.name}
                  </Link>
                  <span className="task-meta">
                    <span className="habit-progress" aria-hidden="true">
                      <i style={{ width: `${String(met ? 100 : percent)}%` }} />
                    </span>
                    <span className="today-habit-count">
                      {habit.today.count}/{habit.goal.target_count}
                    </span>
                    {habit.reminder_time !== null ? (
                      <time className="task-time">{habit.reminder_time}</time>
                    ) : null}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {error ? (
        <p className="error" role="alert">
          {m.todayHabitError}
        </p>
      ) : null}
    </details>
  );
}
